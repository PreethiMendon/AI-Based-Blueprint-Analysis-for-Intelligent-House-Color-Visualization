#!/usr/bin/env python3
"""
analyze.py - robust room detection + OCR labeling with debug overlay

Usage:
  python analyze.py path/to/blueprint.png
  python analyze.py path/to/blueprint.png --debug

Outputs JSON to stdout:
  { "width": W, "height": H, "areas": [ {id, name, bbox:{x,y,width,height}, iconPosition:{x,y}} ... ] }

Produces debug_<basename>.png when --debug is passed.

Dependencies:
  - opencv-python or opencv-python-headless
  - numpy
  - Pillow
  - (optional) pytesseract and tesseract OCR binary for OCR labeling
"""

import sys
import json
import math
import re
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

# optional pytesseract (if installed)
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except Exception:
    TESSERACT_AVAILABLE = False

# ---------------- Tunable parameters (adjust for your dataset) ----------------
MIN_ROOM_AREA = 2000         # minimal pixel area to consider a region a room
MIN_ROOM_WIDTH = 28
MIN_ROOM_HEIGHT = 28
MAX_ROOM_RATIO = 0.98        # ignore shapes covering ~entire image
MERGE_IOU_THRESHOLD = 0.40   # merge boxes with IoU above this
SPLIT_MAX_ASPECT = 6.0       # if a box is extremely wide/ tall maybe it's multi-room
WATERSHED_FG_FACTOR = 0.38
ADAPTIVE_THRESH_BLOCKSIZE = 21
ADAPTIVE_THRESH_C = 8
OCR_CONF_THRESHOLD = 30      # minimal OCR confidence to accept token
LINE_Y_FACTOR = 0.01         # grouping tokens into lines relative to min(image dim)
# ------------------------------------------------------------------------------

CANONICAL = {
    'bed': 'Bedroom', 'bedroom': 'Bedroom', 'master bedroom': 'Master Bedroom',
    'living': 'Living Room', 'living room': 'Living Room', 'dining': 'Dining Room',
    'kitchen': 'Kitchen', 'bathroom': 'Bathroom', 'bath': 'Bathroom', 'wc': 'Toilet',
    'toilet': 'Toilet', 'store': 'Store', 'balcony': 'Balcony', 'corridor': 'Corridor', 'hall': 'Hall', 'study': 'Study'
}

def load_image_any(path):
    img = cv2.imread(str(path))
    if img is not None:
        return img
    try:
        pil = Image.open(path).convert("RGB")
        return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        return None

def rect_iou(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ax2, ay2 = ax + aw, ay + ah
    bx2, by2 = bx + bw, by + bh
    ix1, iy1 = max(ax, bx), max(ay, by)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0

def merge_overlapping_boxes(boxes, iou_thresh=MERGE_IOU_THRESHOLD):
    """
    Greedy merge by IoU. Keeps merging until stable.
    boxes: list of (x,y,w,h)
    """
    if not boxes:
        return []
    boxes = [tuple(b) for b in boxes]
    changed = True
    while changed:
        changed = False
        new_boxes = []
        used = [False] * len(boxes)
        for i, a in enumerate(boxes):
            if used[i]:
                continue
            ax, ay, aw, ah = a
            mx1, my1, mx2, my2 = ax, ay, ax + aw, ay + ah
            used[i] = True
            merged_any = False
            for j in range(i + 1, len(boxes)):
                if used[j]:
                    continue
                b = boxes[j]
                if rect_iou(a, b) > iou_thresh:
                    bx, by, bw, bh = b
                    mx1 = min(mx1, bx); my1 = min(my1, by)
                    mx2 = max(mx2, bx + bw); my2 = max(my2, by + bh)
                    used[j] = True
                    merged_any = True
                    changed = True
            new_boxes.append((int(mx1), int(my1), int(mx2 - mx1), int(my2 - my1)))
        boxes = new_boxes
    return boxes

def preprocess_for_segmentation(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # denoise while keeping edges
    blur = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)
    th = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, ADAPTIVE_THRESH_BLOCKSIZE, ADAPTIVE_THRESH_C)
    # close small wall gaps, open to remove specks
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (7,7))
    closed = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel_close, iterations=2)
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (3,3))
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open, iterations=1)
    return opened

def watershed_segments(binary):
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3,3))
    opening = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    sure_bg = cv2.dilate(opening, kernel, iterations=3)
    dist = cv2.distanceTransform(opening, cv2.DIST_L2, 5)
    if dist.max() <= 0:
        return np.zeros_like(binary, dtype=np.int32)
    _, sure_fg = cv2.threshold(dist, WATERSHED_FG_FACTOR * dist.max(), 255, 0)
    sure_fg = np.uint8(sure_fg)
    unknown = cv2.subtract(sure_bg, sure_fg)
    _, markers = cv2.connectedComponents(sure_fg)
    markers = markers + 1
    markers[unknown == 255] = 0
    color = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)
    markers = cv2.watershed(color, markers.astype(np.int32))
    labels = np.copy(markers)
    labels[labels == -1] = 0
    return labels.astype(np.int32)

def detect_rooms_by_shape(img):
    h_img, w_img = img.shape[:2]
    pre = preprocess_for_segmentation(img)
    kernel_fill = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5,5))
    pre_filled = cv2.morphologyEx(pre, cv2.MORPH_CLOSE, kernel_fill, iterations=1)

    labels = watershed_segments(pre_filled)
    unique_labels = [l for l in np.unique(labels) if l > 1]

    rooms = []
    img_area = w_img * h_img

    for lab in unique_labels:
        mask = (labels == lab).astype('uint8') * 255
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3,3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        cnt = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(cnt)
        if area < MIN_ROOM_AREA or area > MAX_ROOM_RATIO * img_area:
            continue
        x, y, wbox, hbox = cv2.boundingRect(cnt)
        if wbox < MIN_ROOM_WIDTH and hbox < MIN_ROOM_HEIGHT:
            continue
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull) if hull is not None else area
        solidity = area / hull_area if hull_area > 0 else 0.0
        if solidity < 0.25:
            continue
        cx = x + wbox / 2.0
        cy = y + hbox / 2.0
        rooms.append({
            "bbox": {"x": int(x), "y": int(y), "width": int(wbox), "height": int(hbox)},
            "center": {"x": float(cx), "y": float(cy)},
            "area": float(area)
        })

    # fallback to contour-only if nothing
    if not rooms:
        contours, _ = cv2.findContours(pre_filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < MIN_ROOM_AREA or area > MAX_ROOM_RATIO * (w_img*h_img):
                continue
            x, y, wbox, hbox = cv2.boundingRect(cnt)
            if wbox < MIN_ROOM_WIDTH or hbox < MIN_ROOM_HEIGHT:
                continue
            cx = x + wbox / 2.0
            cy = y + hbox / 2.0
            rooms.append({
                "bbox": {"x": int(x), "y": int(y), "width": int(wbox), "height": int(hbox)},
                "center": {"x": float(cx), "y": float(cy)},
                "area": float(wbox * hbox)
            })

    # sort descending by area
    rooms.sort(key=lambda r: -r["area"])

    # merge heavily overlapping boxes (greedy IoU)
    boxes = [(r["bbox"]["x"], r["bbox"]["y"], r["bbox"]["width"], r["bbox"]["height"]) for r in rooms]
    merged = merge_overlapping_boxes(boxes)

    # small heuristic: split huge aspect ratio boxes (possible merged rooms)
    refined = []
    for (x,y,wbox,hbox) in merged:
        aspect = max(wbox/hbox if hbox else 0, hbox/wbox if wbox else 0)
        if aspect > SPLIT_MAX_ASPECT and max(wbox,hbox) > 200:
            # attempt to split along longer axis by finding minima in projection
            roi = pre_filled[y:y+hbox, x:x+wbox]
            if roi.size == 0:
                refined.append((x,y,wbox,hbox))
                continue
            # project sums
            if wbox > hbox:
                proj = np.sum(roi, axis=0)
                cut = np.argmin(proj[int(0.25*wbox):int(0.75*wbox)]) + int(0.25*wbox)
                refined.append((x,y,cut,hbox))
                refined.append((x+cut,y,wbox-cut,hbox))
            else:
                proj = np.sum(roi, axis=1)
                cut = np.argmin(proj[int(0.25*hbox):int(0.75*hbox)]) + int(0.25*hbox)
                refined.append((x,y,wbox,cut))
                refined.append((x,y+cut,wbox,hbox-cut))
        else:
            refined.append((x,y,wbox,hbox))

    # clamp & return final rooms
    final_rooms = []
    for (x,y,wbox,hbox) in refined:
        if wbox <= 0 or hbox <= 0:
            continue
        cx = x + wbox/2.0
        cy = y + hbox/2.0
        final_rooms.append({
            "bbox": {"x": int(x), "y": int(y), "width": int(wbox), "height": int(hbox)},
            "center": {"x": float(cx), "y": float(cy)},
            "area": float(wbox * hbox)
        })

    return final_rooms

# ---------------- OCR helpers ----------------

def normalize_text(s):
    if not s:
        return ""
    s = s.strip()
    s = re.sub(r'[^A-Za-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    return s.lower()

def canonicalize_label(raw):
    s = normalize_text(raw)
    if not s:
        return None
    for token, canon in CANONICAL.items():
        if token in s:
            # extract number if present (bed 1 -> Bedroom 1)
            m = re.search(r'(\d+)', s)
            if m and 'bed' in token:
                return f"{canon} {m.group(1)}"
            return canon
    m = re.search(r'(bed(room)?\s*\d+)', s)
    if m:
        digits = re.findall(r'\d+', m.group(0))
        if digits:
            return f"Bedroom {digits[0]}"
    return s.title()

def assign_names_from_ocr(img, rooms):
    if not TESSERACT_AVAILABLE:
        return None

    h, w = img.shape[:2]
    try:
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
    except Exception:
        return None

    texts = data.get("text", [])
    if not texts:
        return None

    tokens = []
    n = len(texts)
    for i in range(n):
        txt = (texts[i] or "").strip()
        if not txt:
            continue
        try:
            conf = float(data["conf"][i])
        except Exception:
            conf = 0.0
        if conf < OCR_CONF_THRESHOLD:
            continue
        x = int(data["left"][i]); y = int(data["top"][i]); bw = int(data["width"][i]); bh = int(data["height"][i])
        tokens.append({"text": txt, "conf": conf, "bbox": (x,y,bw,bh), "center": (x + bw/2.0, y + bh/2.0)})

    if not tokens:
        return None

    # group tokens into lines by vertical proximity
    tokens.sort(key=lambda t: t["bbox"][1])
    lines = []
    LINE_Y_THRESH = max(6, int(min(h,w) * LINE_Y_FACTOR))
    for t in tokens:
        tx, ty, tw, th = t["bbox"]
        midy = ty + th/2.0
        placed = False
        for ln in lines:
            if abs(midy - ln["mid_y"]) <= LINE_Y_THRESH:
                ln["tokens"].append(t)
                lx, ly, lw, lh = ln["bbox"]
                nx1 = min(lx, tx); ny1 = min(ly, ty)
                nx2 = max(lx + lw, tx + tw); ny2 = max(ly + lh, ty + th)
                ln["bbox"] = (nx1, ny1, nx2 - nx1, ny2 - ny1)
                ln["mid_y"] = (ln["mid_y"] * (len(ln["tokens"]) - 1) + midy) / len(ln["tokens"])
                placed = True
                break
        if not placed:
            lines.append({"tokens":[t], "bbox":(tx,ty,tw,th), "mid_y": midy})

    # merge overlapping lines
    merged = []
    for ln in lines:
        if not merged:
            merged.append(ln)
            continue
        prev = merged[-1]
        px, py, pw, ph = prev["bbox"]; nx, ny, nw, nh = ln["bbox"]
        if not (nx > px + pw or px > nx + nw):
            mx1 = min(px, nx); my1 = min(py, ny)
            mx2 = max(px+pw, nx+nw); my2 = max(py+ph, ny+nh)
            prev["bbox"] = (mx1, my1, mx2 - mx1, my2 - my1)
            prev["tokens"].extend(ln["tokens"])
            prev["mid_y"] = (prev["mid_y"] + ln["mid_y"]) / 2.0
        else:
            merged.append(ln)
    lines = merged

    # prepare room boxes
    room_boxes = []
    for r in rooms:
        b = r.get("bbox", {})
        room_boxes.append({"room": r, "bbox": (b["x"], b["y"], b["width"], b["height"]), "assigned": []})

    def intersect_area(a, b):
        ax, ay, aw, ah = a; bx, by, bw, bh = b
        ix1 = max(ax, bx); iy1 = max(ay, by); ix2 = min(ax+aw, bx+bw); iy2 = min(ay+ah, by+bh)
        if ix2 <= ix1 or iy2 <= iy1:
            return 0
        return (ix2 - ix1) * (iy2 - iy1)

    # assign each OCR line to room with largest intersection area
    for ln in lines:
        lx, ly, lw, lh = ln["bbox"]
        best_idx = None; best_inter = 0
        for idx, rb in enumerate(room_boxes):
            inter = intersect_area((lx,ly,lw,lh), rb["bbox"])
            if inter > best_inter:
                best_inter = inter; best_idx = idx
        if best_idx is not None and best_inter > 0:
            words = [t["text"] for t in ln["tokens"]]
            joined = " ".join(words)
            avg_conf = sum(t["conf"] for t in ln["tokens"]) / len(ln["tokens"])
            room_boxes[best_idx]["assigned"].append((joined, avg_conf))
        else:
            # fallback nearest centroid
            cx = lx + lw/2.0; cy = ly + lh/2.0
            nearest = None; nearest_d = float("inf")
            for idx, rb in enumerate(room_boxes):
                rx, ry, rw, rh = rb["bbox"]
                rcx = rx + rw/2.0; rcy = ry + rh/2.0
                d = math.hypot(cx - rcx, cy - rcy)
                if d < nearest_d:
                    nearest_d = d; nearest = idx
            diag = math.hypot(w, h)
            if nearest is not None and nearest_d <= diag * 0.30:
                words = [t["text"] for t in ln["tokens"]]
                joined = " ".join(words)
                avg_conf = sum(t["conf"] for t in ln["tokens"]) / len(ln["tokens"])
                room_boxes[nearest]["assigned"].append((joined, avg_conf))

    labels = []
    for rb in room_boxes:
        assigned = rb["assigned"]
        if not assigned:
            labels.append(None)
            continue
        best = max(assigned, key=lambda ac: (ac[1] * len(ac[0])))
        labels.append(canonicalize_label(best[0]))

    return labels

def assign_names_by_layout(rooms, img_width, img_height):
    n = len(rooms)
    names = [f"Area {i+1}" for i in range(n)]
    if n == 0:
        return names
    mid_x = img_width / 2.0
    mid_y = img_height / 2.0
    indexed = list(enumerate(rooms))
    left = [(i, r) for i, r in indexed if r["center"]["x"] < mid_x]
    right = [(i, r) for i, r in indexed if r["center"]["x"] >= mid_x]
    if left:
        top_left = min(left, key=lambda ir: ir[1]["center"]["y"])
        names[top_left[0]] = "Master Bedroom"
        if len(left) > 1:
            bottom_left = max(left, key=lambda ir: ir[1]["center"]["y"])
            if bottom_left[0] != top_left[0]:
                names[bottom_left[0]] = "Living Room"
    if right:
        top_right = min(right, key=lambda ir: ir[1]["center"]["y"])
        names[top_right[0]] = "Bedroom 2"
        right_lower = [(i, r) for i, r in right if r["center"]["y"] >= mid_y]
        if right_lower:
            largest = max(right_lower, key=lambda ir: ir[1]["area"])
            smallest = min(right_lower, key=lambda ir: ir[1]["area"])
            names[largest[0]] = "Kitchen"
            if smallest[0] != largest[0]:
                names[smallest[0]] = "Bathroom"
    return names

def analyze_blueprint(image_path: str, debug: bool = False):
    image_path = Path(image_path)
    img = load_image_any(str(image_path))
    if img is None:
        return {"width": 0, "height": 0, "areas": []}
    h_img, w_img = img.shape[:2]

    rooms = detect_rooms_by_shape(img)

    ocr_names = None
    if TESSERACT_AVAILABLE and rooms:
        ocr_names = assign_names_from_ocr(img, rooms)
        # try small rotations if OCR missed labels
        if not ocr_names or len(ocr_names) != len(rooms):
            for angle in (-8, 8):
                M = cv2.getRotationMatrix2D((w_img/2, h_img/2), angle, 1.0)
                rot = cv2.warpAffine(img, M, (w_img, h_img), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
                ocr_names = assign_names_from_ocr(rot, rooms)
                if ocr_names:
                    break

    if ocr_names and len(ocr_names) == len(rooms):
        names = [n if n else f"Area {i+1}" for i, n in enumerate(ocr_names)]
    else:
        names = assign_names_by_layout(rooms, w_img, h_img)

    areas = []
    for idx, room in enumerate(rooms):
        b = room["bbox"]
        areas.append({
            "id": idx + 1,
            "name": names[idx] if idx < len(names) else f"Area {idx+1}",
            "bbox": {"x": int(b["x"]), "y": int(b["y"]), "width": int(b["width"]), "height": int(b["height"])},
            "iconPosition": {"x": float(room["center"]["x"]), "y": float(room["center"]["y"])}
        })

    if not areas:
        areas = [{
            "id": 1,
            "name": "Living Room",
            "bbox": {"x": 0, "y": 0, "width": int(w_img), "height": int(h_img)},
            "iconPosition": {"x": float(w_img/2), "y": float(h_img/2)}
        }]

    if debug:
        dbg = img.copy()
        for a in areas:
            b = a["bbox"]
            x,y,ww,hh = b["x"], b["y"], b["width"], b["height"]
            cv2.rectangle(dbg, (x,y), (x+ww, y+hh), (0,128,200), 3)
            label = a["name"][:40]
            cv2.putText(dbg, label, (x+6, y+18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (10,10,10), 2, cv2.LINE_AA)
        if TESSERACT_AVAILABLE:
            try:
                data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
                n = len(data.get('text', []))
                for i in range(n):
                    txt = data['text'][i]
                    if not txt or txt.strip() == "":
                        continue
                    try:
                        conf = float(data['conf'][i])
                    except:
                        conf = 0.0
                    x = int(data['left'][i]); y = int(data['top'][i]); bw = int(data['width'][i]); bh = int(data['height'][i])
                    color = (0,200,0) if conf >= OCR_CONF_THRESHOLD else (200,150,0)
                    cv2.rectangle(dbg, (x,y), (x+bw, y+bh), color, 1)
                    cv2.putText(dbg, f"{txt}:{int(conf)}", (x, y-4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA)
            except Exception as e:
                print("OCR debug overlay failed:", e, file=sys.stderr)
        outname = f"debug_{image_path.stem}.png"
        cv2.imwrite(outname, dbg)
        print(f"Saved debug image: {outname}", file=sys.stderr)

    return {"width": int(w_img), "height": int(h_img), "areas": areas}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"width": 0, "height": 0, "areas": []}))
        return
    image_path = sys.argv[1]
    debug = ("--debug" in sys.argv) or ("-d" in sys.argv)
    try:
        res = analyze_blueprint(image_path, debug=debug)
    except Exception as e:
        res = {"width": 0, "height": 0, "areas": [], "error": str(e)}
    print(json.dumps(res))
    return

if __name__ == "__main__":
    main()
