# detect.py
"""
Room-only detector for blueprints.

Usage (CLI):
    python detect.py path/to/blueprint.png [out_prefix]

Outputs:
- Prints JSON to stdout:
  { "rooms": [ {"id":0,"bbox":[x,y,w,h],"area":1234}, ... ] }
- Writes annotated image: {out_prefix}_annot.png (default: <basename>_annot.png)

Dependencies:
    pip install opencv-python numpy
Optional (improves proximity math):
    pip install shapely
"""
import os
import sys
import json
import math
import traceback

import cv2
import numpy as np

try:
    from shapely.geometry import Polygon, Point
    _HAS_SHAPELY = True
except Exception:
    _HAS_SHAPELY = False

# ---------------- helpers ----------------
def debug_print(*args, **kwargs):
    # change to logger if needed
    print("[detect]", *args, **kwargs)

def preprocess(img, target_long_side=1200):
    """Resize (if needed) and lightly blur."""
    h,w = img.shape[:2]
    scale = max(1.0, target_long_side / max(h,w))
    if scale != 1.0:
        img = cv2.resize(img, (int(w*scale), int(h*scale)), interpolation=cv2.INTER_AREA)
    return cv2.GaussianBlur(img, (3,3), 0)

def auto_detect_wall_mask(img):
    """
    Auto-detect likely wall/line color using edge-sample median color + HSV range.
    Fallback to adaptive threshold if color method fails.
    """
    h,w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    ys, xs = np.where(edges > 0)
    mask = None
    try:
        if len(xs) > 20:
            samples = img[ys, xs].reshape(-1,3)
            med = np.median(samples, axis=0).astype(np.uint8)
            # convert median (RGB-like) to HSV via BGR wrap
            med_bgr = np.uint8([[med[::-1].tolist()]])
            med_hsv = cv2.cvtColor(med_bgr, cv2.COLOR_BGR2HSV)[0,0].astype(int)
            h0,s0,v0 = int(med_hsv[0]), int(med_hsv[1]), int(med_hsv[2])
            if s0 < 30:
                lower = np.array([0, 0, max(0, v0-60)], dtype=np.uint8)
                upper = np.array([179, 80, min(255, v0+60)], dtype=np.uint8)
            else:
                lower = np.array([max(0, h0-12), max(30, s0-60), max(30, v0-80)], dtype=np.uint8)
                upper = np.array([min(179, h0+12), min(255, s0+80), min(255, v0+80)], dtype=np.uint8)
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            maskc = cv2.inRange(hsv, lower, upper)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9,9))
            maskc = cv2.morphologyEx(maskc, cv2.MORPH_CLOSE, kernel, iterations=2)
            # only accept color mask if it has some coverage
            if np.count_nonzero(maskc) > 0.001 * h * w:
                mask = maskc
    except Exception:
        mask = None

    if mask is None:
        # grayscale adaptive threshold fallback (detect dark walls/lines)
        th = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                                   cv2.THRESH_BINARY_INV, 15, 12)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5,5))
        mask = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=2)

    # closing & opening to make walls solid
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7,7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask

def extract_rooms_from_wall_mask(wall_mask, min_area=1200):
    """
    Given a binary wall mask (walls/lines highlighted), floodfill invert to get room areas.
    Returns list of dicts: {contour, bbox, area}
    """
    try:
        inv = cv2.bitwise_not(wall_mask)
        h,w = inv.shape
        flood = inv.copy()
        mask = np.zeros((h+2, w+2), np.uint8)
        cv2.floodFill(flood, mask, (0,0), 255)
        rooms_mask = cv2.bitwise_not(flood)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5,5))
        rooms_mask = cv2.morphologyEx(rooms_mask, cv2.MORPH_OPEN, kernel, iterations=1)
        contours, _ = cv2.findContours(rooms_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        polys = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue
            x,y,wid,ht = cv2.boundingRect(cnt)
            polys.append({'contour': cnt, 'bbox': (int(x),int(y),int(wid),int(ht)), 'area': float(area)})
        polys.sort(key=lambda r: -r['area'])
        return polys, rooms_mask
    except Exception as e:
        debug_print("extract_rooms_from_wall_mask error:", e)
        return [], None

def extract_rooms_by_edges(img, min_area=1000):
    """Alternative segmentation: adaptive threshold + morphological steps, find large contours."""
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        th = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY_INV, 15, 8)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9,9))
        closed = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=2)
        kernel2 = cv2.getStructuringElement(cv2.MORPH_RECT, (5,5))
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel2, iterations=1)
        contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        polys = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue
            x,y,wid,ht = cv2.boundingRect(cnt)
            polys.append({'contour': cnt, 'bbox': (int(x),int(y),int(wid),int(ht)), 'area': float(area)})
        polys.sort(key=lambda r: -r['area'])
        return polys, opened
    except Exception as e:
        debug_print("extract_rooms_by_edges error:", e)
        return [], None

def pick_best_polys(polys_a, mask_a, polys_b, mask_b, img_shape):
    """
    Score both polygon sets and choose the better one.
    Scoring heuristic: number of polys + average polygon area coverage.
    """
    def score(polys):
        if not polys:
            return 0.0
        areas = [p['area'] for p in polys]
        avg_area = sum(areas) / len(areas)
        coverage = sum(areas) / (img_shape[0] * img_shape[1])
        # prefer moderate count and reasonable coverage
        return min(len(polys), 20) * (avg_area ** 0.5) * (1 + coverage)
    sa = score(polys_a)
    sb = score(polys_b)
    return (polys_a, mask_a) if sa >= sb else (polys_b, mask_b)

def draw_annotation(img, room_polys, out_path=None):
    out = img.copy()
    # if image gray-ish convert to color for annotation
    if len(out.shape) == 2 or out.shape[2] == 1:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for i, r in enumerate(room_polys):
        try:
            cv2.drawContours(out, [r['contour']], -1, (0,255,0), 2)  # green contour
            x,y,wid,ht = r['bbox']
            label = f"Room {i}"
            # draw id near top-left of bbox
            cv2.putText(out, label, (x, max(12, y-6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,0,0), 2, cv2.LINE_AA)
            # small filled rectangle for visibility
            cv2.rectangle(out, (x,y), (x+2, y+2), (0,255,0), -1)
        except Exception:
            continue
    if out_path:
        cv2.imwrite(out_path, out)
    return out

# ---------------- main detect ----------------
def detect_image(image_path, out_prefix=None, save_annot=True, min_area=None):
    """
    Run the room detector on image_path.
    Returns dict with 'rooms' (list) and 'annotated_image' path (if saved).
    """
    if not os.path.exists(image_path):
        return {'error': 'file_not_found', 'path': image_path}
    img = cv2.imread(image_path)
    if img is None:
        return {'error': 'read_failed', 'path': image_path}
    # preprocess
    imgp = preprocess(img, target_long_side=1200)
    h,w = imgp.shape[:2]

    # detect with auto color (or grayscale fallback)
    wall_mask = auto_detect_wall_mask(imgp)
    polys_color, mask_color = extract_rooms_from_wall_mask(wall_mask, min_area=(min_area or max(1200, (h*w)//500)))
    # edge method fallback
    polys_edge, mask_edge = extract_rooms_by_edges(imgp, min_area=(min_area or max(1000, (h*w)//700)))

    # choose best set
    room_polys, rooms_mask = pick_best_polys(polys_color, mask_color, polys_edge, mask_edge, imgp.shape)

    # prepare output list
    rooms = []
    for i, r in enumerate(room_polys):
        x,y,wid,ht = r['bbox']
        rooms.append({'id': int(i), 'bbox': [int(x), int(y), int(wid), int(ht)], 'area': float(r['area'])})

    # annotated image name
    base = out_prefix if out_prefix else os.path.splitext(os.path.basename(image_path))[0]
    annot_path = os.path.join(os.path.dirname(image_path) or '.', f"{base}_annot.png")
    if save_annot:
        draw_annotation(imgp, room_polys, out_path=annot_path)
    else:
        annot_path = None

    return {'rooms': rooms, 'annotated_image': annot_path}

# ---------------- CLI ----------------
def main(argv):
    if len(argv) < 2:
        print("Usage: python detect.py path/to/image.png [out_prefix]")
        sys.exit(1)
    image_path = argv[1]
    out_prefix = argv[2] if len(argv) > 2 else None
    try:
        res = detect_image(image_path, out_prefix=out_prefix, save_annot=True)
        # print JSON to stdout for capture by node/other processes
        print(json.dumps(res, indent=2))
    except Exception as e:
        tb = traceback.format_exc()
        debug_print("Unhandled exception:", e)
        debug_print(tb)
        # still print error JSON so caller can handle it
        print(json.dumps({'error': 'exception', 'detail': str(e), 'trace': tb}, indent=2))
        sys.exit(2)

if __name__ == "__main__":
    main(sys.argv)
