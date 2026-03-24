# detect_verbose2.py
"""
Verbose room detector with run-time style flags.

Usage:
  python detect_verbose2.py path/to/blueprint.png [--fill] [--thick] [--labels ocr|room]
                             [--icons /path/to/icons_dir] [--no-ocr] [--outprefix NAME]
                             [--merge-iou FLOAT] [--force-edge] [--save-json]

Outputs:
 - JSON printed
 - Annotated image: <outprefix>_annot_verbose2.png
 - Optional rooms JSON file saved next to annotated image when --save-json is used.

Install:
  pip install opencv-python numpy easyocr pytesseract
  (pytesseract requires the Tesseract binary on the system)
"""
import os
import sys
import json
import math
import time
import argparse
import traceback
from pathlib import Path

import cv2
import numpy as np

# Optional OCR libs (safe imports)
_HAS_EASYOCR = False
_READER = None
try:
    import easyocr
    _READER = easyocr.Reader(['en'], gpu=False)
    _HAS_EASYOCR = True
except Exception:
    _HAS_EASYOCR = False

_HAS_PYTESS = False
_Output = None
try:
    import pytesseract
    from pytesseract import Output as _Output
    _HAS_PYTESS = True
except Exception:
    _HAS_PYTESS = False

# ---------------- utilities ----------------
def preprocess(img, target_long_side=1400):
    h, w = img.shape[:2]
    scale = max(1.0, target_long_side / max(h, w))
    if scale != 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return cv2.GaussianBlur(img, (3, 3), 0)

def auto_mask(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 180)
    ys, xs = np.where(edges > 0)
    mask = None
    if len(xs) > 30:
        try:
            samples = img[ys, xs].reshape(-1, 3)
            med = np.median(samples, axis=0).astype(np.uint8)
            med_bgr = np.uint8([[med[::-1].tolist()]])
            med_hsv = cv2.cvtColor(med_bgr, cv2.COLOR_BGR2HSV)[0, 0].astype(int)
            h0, s0, v0 = int(med_hsv[0]), int(med_hsv[1]), int(med_hsv[2])
            if s0 < 30:
                lower = np.array([0, 0, max(0, v0 - 60)], np.uint8)
                upper = np.array([179, 100, min(255, v0 + 60)], np.uint8)
            else:
                lower = np.array([max(0, h0 - 12), max(20, s0 - 60), max(20, v0 - 80)], np.uint8)
                upper = np.array([min(179, h0 + 12), min(255, s0 + 80), min(255, v0 + 80)], np.uint8)
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            m = cv2.inRange(hsv, lower, upper)
            k = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, iterations=2)
            if np.count_nonzero(m) > 0.0008 * img.shape[0] * img.shape[1]:
                mask = m
        except Exception:
            mask = None
    if mask is None:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        th = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 12)
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        mask = cv2.morphologyEx(th, cv2.MORPH_CLOSE, k, iterations=2)
    k2 = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k2, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k2, iterations=1)
    return mask

def rooms_from_mask(mask, min_area=1200):
    inv = cv2.bitwise_not(mask)
    h, w = inv.shape
    flood = inv.copy()
    m = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(flood, m, (0, 0), 255)
    rooms_mask = cv2.bitwise_not(flood)
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    rooms_mask = cv2.morphologyEx(rooms_mask, cv2.MORPH_OPEN, k, iterations=1)
    contours, _ = cv2.findContours(rooms_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        x, y, wid, ht = cv2.boundingRect(cnt)
        polys.append({'contour': cnt, 'bbox': (int(x), int(y), int(wid), int(ht)), 'area': float(area)})
    polys.sort(key=lambda r: -r['area'])
    return polys, rooms_mask

def rooms_by_edges(img, min_area=900):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    th = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 8)
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    closed = cv2.morphologyEx(th, cv2.MORPH_CLOSE, k, iterations=2)
    k2 = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, k2, iterations=1)
    contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        x, y, wid, ht = cv2.boundingRect(cnt)
        polys.append({'contour': cnt, 'bbox': (int(x), int(y), int(wid), int(ht)), 'area': float(area)})
    polys.sort(key=lambda r: -r['area'])
    return polys, opened

def pick_best(a, ma, b, mb, shape):
    def score(ps):
        if not ps:
            return 0.0
        areas = [p['area'] for p in ps]
        avg = sum(areas) / len(areas)
        coverage = sum(areas) / (shape[0] * shape[1])
        return len(ps) * (avg ** 0.45) * (1 + coverage)
    return (a, ma) if score(a) >= score(b) else (b, mb)

# ---------------- MSER + OCR ----------------
def detect_mser(img, max_regions=200):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    try:
        mser = cv2.MSER_create()
        regions, boxes = mser.detectRegions(gray)
    except Exception:
        th = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 12)
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, k, iterations=1)
        contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        boxes = [cv2.boundingRect(c) for c in contours]
    rects = []
    for b in boxes:
        x, y, w, h = b
        pad = max(2, int(min(img.shape[:2]) / 300))
        x = max(0, x - pad)
        y = max(0, y - pad)
        w = min(img.shape[1] - x, w + 2 * pad)
        h = min(img.shape[0] - y, h + 2 * pad)
        rects.append((x, y, w, h))
    rects = sorted(rects, key=lambda r: -r[2] * r[3])[:max_regions]
    kept = []
    def iou(a, b):
        ax, ay, aw, ah = a; bx, by, bw, bh = b
        inter_w = max(0, min(ax + aw, bx + bw) - max(ax, bx)); inter_h = max(0, min(ay + ah, by + bh) - max(ay, by))
        inter = inter_w * inter_h; union = aw * ah + bw * bh - inter
        return inter / union if union > 0 else 0
    for r in rects:
        ok = True
        for k in kept:
            if iou(r, k) > 0.6:
                ok = False
                break
        if ok:
            kept.append(r)
    return kept

def ocr_crop(crop):
    if _HAS_EASYOCR and _READER is not None:
        try:
            res = _READER.readtext(crop, detail=1)
            out = []
            for bbox, text, conf in res:
                if not text or text.strip() == "":
                    continue
                xs = [int(p[0]) for p in bbox]; ys = [int(p[1]) for p in bbox]
                x, y, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
                out.append({'text': text.strip(), 'conf': float(conf), 'bbox': (int(x), int(y), int(w), int(h))})
            return out, 'easyocr'
        except Exception:
            pass
    if _HAS_PYTESS:
        try:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            data = pytesseract.image_to_data(gray, output_type=_Output)
            out = []
            n = len(data['level'])
            for i in range(n):
                t = str(data['text'][i]).strip()
                if not t:
                    continue
                conf = float(data['conf'][i]) if str(data['conf'][i]).lstrip('-').replace('.', '').isdigit() else -1.0
                x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                out.append({'text': t, 'conf': conf, 'bbox': (int(x), int(y), int(w), int(h))})
            return out, 'pytesseract'
        except Exception:
            pass
    return [], 'none'

def merge_boxes(boxes, iou_thresh=0.5):
    boxes = sorted(boxes, key=lambda b: -b.get('conf', 0))
    kept = []
    def iou(a, b):
        ax, ay, aw, ah = a; bx, by, bw, bh = b
        inter_w = max(0, min(ax + aw, bx + bw) - max(ax, bx)); inter_h = max(0, min(ay + ah, by + bh) - max(ay, by))
        inter = inter_w * inter_h; union = aw * ah + bw * bh - inter
        return inter / union if union > 0 else 0
    for b in boxes:
        bb = b['bbox']; merged = False
        for k in kept:
            if iou(bb, k['bbox']) > iou_thresh:
                # merge heuristics
                k['text'] = k['text'] if len(k['text']) >= len(b['text']) else b['text']
                k['conf'] = max(k.get('conf', 0), b.get('conf', 0))
                xx = min(k['bbox'][0], bb[0]); yy = min(k['bbox'][1], bb[1])
                x2 = max(k['bbox'][0] + k['bbox'][2], bb[0] + bb[2]); y2 = max(k['bbox'][1] + k['bbox'][3], bb[1] + bb[3])
                k['bbox'] = (int(xx), int(yy), int(x2 - xx), int(y2 - yy))
                merged = True
                break
        if not merged:
            kept.append(b.copy())
    return kept

def assign_boxes(boxes, room_polys, max_dist=500):
    assoc = {i: [] for i in range(len(room_polys))}
    orphan = []
    for b in boxes:
        bx, by, bw, bh = b['bbox']; cx = bx + bw / 2.0; cy = by + bh / 2.0
        assigned = False
        for i, r in enumerate(room_polys):
            try:
                if cv2.pointPolygonTest(r['contour'], (int(cx), int(cy)), False) >= 0:
                    assoc[i].append(b); assigned = True; break
            except Exception:
                continue
        if not assigned:
            min_d, min_i = 1e9, None
            for i, r in enumerate(room_polys):
                x, y, wid, ht = r['bbox']; rcx, rcy = x + wid / 2.0, y + ht / 2.0
                d = math.hypot(rcx - cx, rcy - cy)
                if d < min_d:
                    min_d, min_i = d, i
            if min_i is not None and min_d < max_dist:
                assoc[min_i].append(b)
            else:
                orphan.append(b)
    return assoc, orphan

# ---------------- drawing (tunable) ----------------
def draw_output(img, room_polys, merged_boxes, assoc, orphan, out_path, style):
    out = img.copy()
    H, W = out.shape[:2]
    scale = math.sqrt(H * W) / 1200.0
    do_fill = style.get('fill', False)
    thick = style.get('thick', False)
    label_mode = style.get('labels', 'room')
    icons_dir = style.get('icons', None)

    contour_wide = int(max(3, 4 * scale)) if thick else int(max(2, 2.5 * scale))
    contour_inner = int(max(1, 2 * scale))
    label_scale = max(0.6, 0.6 * scale)
    small_scale = max(0.45, 0.45 * scale)

    # fill overlay
    if do_fill:
        overlay = out.copy()
        for r in room_polys:
            try:
                mask = np.zeros((H, W), np.uint8)
                cv2.drawContours(mask, [r['contour']], -1, 255, -1)
                overlay[mask == 255] = (overlay[mask == 255] * 0.45 + np.array((0, 255, 0)) * 0.55).astype(np.uint8)
            except Exception:
                pass
        out = cv2.addWeighted(overlay, 0.6, out, 0.4, 0)

    # draw contours + labels
    for i, r in enumerate(room_polys):
        try:
            cv2.drawContours(out, [r['contour']], -1, (0, 180, 0), contour_wide, lineType=cv2.LINE_AA)
            cv2.drawContours(out, [r['contour']], -1, (0, 255, 0), contour_inner, lineType=cv2.LINE_AA)
            x, y, wid, ht = r['bbox']
            label_text = f"Room {i}"
            if label_mode == 'ocr' and assoc.get(i):
                texts = [t['text'] for t in assoc[i] if t.get('text')]
                if texts:
                    # use up to 2 tokens (short)
                    label_text = " ".join(texts[:2])
            # halo + text
            cv2.putText(out, label_text, (x, max(16, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, label_scale, (255, 255, 255), int(4 * scale), cv2.LINE_AA)
            cv2.putText(out, label_text, (x, max(16, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, label_scale, (0, 0, 0), int(2 * scale), cv2.LINE_AA)
            # icon at centroid
            cx = int(x + wid / 2.0); cy = int(y + ht / 2.0)
            if icons_dir and os.path.isdir(icons_dir):
                icon_files = [f for f in os.listdir(icons_dir) if f.lower().endswith(('.png', '.jpg', '.webp'))]
                if icon_files:
                    idx = i % len(icon_files)
                    icon_path = os.path.join(icons_dir, icon_files[idx])
                    try:
                        icon = cv2.imread(icon_path, cv2.IMREAD_UNCHANGED)
                        if icon is not None:
                            ih, iw = icon.shape[:2]
                            scale_icon = max(12, int(28 * scale))
                            ratio = scale_icon / max(ih, iw)
                            nh, nw = max(1, int(ih * ratio)), max(1, int(iw * ratio))
                            icon = cv2.resize(icon, (nw, nh), interpolation=cv2.INTER_AREA)
                            sx = max(0, cx - nw // 2); sy = max(0, cy - nh // 2)
                            ex = min(W, sx + nw); ey = min(H, sy + nh)
                            if icon.shape[2] == 4:
                                alpha = icon[:, :, 3] / 255.0
                                for c in range(3):
                                    out[sy:ey, sx:ex, c] = (icon[:ey - sy, :ex - sx, c] * alpha[:ey - sy, :ex - sx] +
                                                            out[sy:ey, sx:ex, c] * (1 - alpha[:ey - sy, :ex - sx]))
                            else:
                                out[sy:ey, sx:ex] = icon[:ey - sy, :ex - sx]
                        else:
                            cv2.circle(out, (cx, cy), max(8, int(10 * scale)), (200, 120, 20), -1)
                    except Exception:
                        cv2.circle(out, (cx, cy), max(8, int(10 * scale)), (200, 120, 20), -1)
                else:
                    cv2.circle(out, (cx, cy), max(8, int(10 * scale)), (200, 120, 20), -1)
            else:
                cv2.circle(out, (cx, cy), max(8, int(10 * scale)), (200, 120, 20), -1)
        except Exception:
            pass

    # draw OCR boxes & text
    for b in merged_boxes:
        bx, by, bw, bh = map(int, b['bbox'])
        cv2.rectangle(out, (bx, by), (bx + bw, by + bh), (0, 0, 200), max(1, int(2 * scale)), cv2.LINE_AA)
        t = str(b.get('text', ''))
        if t:
            ytext = min(H - 6, by + bh + 12)
            cv2.putText(out, t, (bx, ytext), cv2.FONT_HERSHEY_SIMPLEX, small_scale, (255, 255, 255), int(3 * scale), cv2.LINE_AA)
            cv2.putText(out, t, (bx, ytext), cv2.FONT_HERSHEY_SIMPLEX, small_scale, (0, 0, 200), int(1 * scale), cv2.LINE_AA)

    # orphan marking
    for o in orphan:
        bx, by, bw, bh = map(int, o['bbox'])
        cv2.rectangle(out, (bx, by), (bx + bw, by + bh), (80, 10, 10), 1)
        cv2.putText(out, "orphan", (bx, by - 6), cv2.FONT_HERSHEY_SIMPLEX, small_scale, (80, 10, 10), 1, cv2.LINE_AA)

    cv2.imwrite(out_path, out)
    return out_path

# ---------------- label canonicalization ----------------
def canonical_label_for_texts(texts):
    if not texts:
        return None
    s = " ".join(texts).lower()
    if any(k in s for k in ['bath', 'toilet', 'wc', 'lavatory', 'lav']):
        return 'Bathroom'
    if any(k in s for k in ['kitchen', 'kit']):
        return 'Kitchen'
    if any(k in s for k in ['bedroom', 'bed', 'master']):
        return 'Bedroom'
    if any(k in s for k in ['living', 'lounge', 'sitting']):
        return 'Living Room'
    return None

# ---------------- pipeline ----------------
def detect_and_annotate(image_path, outprefix=None, flags=None):
    if flags is None:
        flags = {}
    if not os.path.exists(image_path):
        return {'error': 'file_not_found', 'path': image_path}
    t0 = time.time()
    img = cv2.imread(image_path)
    if img is None:
        return {'error': 'read_failed', 'path': image_path}
    imgp = preprocess(img)
    H, W = imgp.shape[:2]

    # segmentation (either auto or forced edge-based)
    if flags.get('force_edge', False):
        polys_b, mb = rooms_by_edges(imgp, min_area=max(300, (H * W) // 1600))
        room_polys, rooms_mask = polys_b, mb
    else:
        mask = auto_mask(imgp)
        polys_a, ma = rooms_from_mask(mask, min_area=max(700, (H * W) // 800))
        polys_b, mb = rooms_by_edges(imgp, min_area=max(700, (H * W) // 900))
        room_polys, rooms_mask = pick_best(polys_a, ma, polys_b, mb, imgp.shape)

    # text detection + OCR
    merged = []
    regions = detect_mser(imgp, max_regions=220)
    if not flags.get('no_ocr', False):
        for (x, y, wid, ht) in regions:
            crop = imgp[y:y + ht, x:x + wid]
            boxes, backend = ocr_crop(crop)
            for b in boxes:
                bx, by, bw, bh = b['bbox']
                txt = b.get('text', '').strip()
                if not txt:
                    continue
                merged.append({'text': txt, 'conf': float(b.get('conf', 0)), 'bbox': (int(x + bx), int(y + by), int(bw), int(bh))})
        # global pass
        if _HAS_EASYOCR and _READER is not None:
            try:
                gres = _READER.readtext(imgp, detail=1)
                for bbox, text, conf in gres:
                    if not text or text.strip() == "":
                        continue
                    xs = [int(p[0]) for p in bbox]; ys = [int(p[1]) for p in bbox]
                    gx, gy, gw, gh = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
                    merged.append({'text': text.strip(), 'conf': float(conf), 'bbox': (int(gx), int(gy), int(gw), int(gh))})
            except Exception:
                pass
        elif _HAS_PYTESS:
            try:
                gray = cv2.cvtColor(imgp, cv2.COLOR_BGR2GRAY)
                data = pytesseract.image_to_data(gray, output_type=_Output)
                n = len(data['level'])
                for i in range(n):
                    t = str(data['text'][i]).strip()
                    if not t:
                        continue
                    conf = float(data['conf'][i]) if str(data['conf'][i]).lstrip('-').replace('.', '').isdigit() else -1.0
                    x, y, wid, ht = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                    merged.append({'text': t, 'conf': conf, 'bbox': (int(x), int(y), int(wid), int(ht))})
            except Exception:
                pass

    merged = merge_boxes(merged, iou_thresh=flags.get('merge_iou', 0.48))
    assoc, orphan = assign_boxes(merged, room_polys, max_dist=max(300, int(max(H, W) * 0.18)))

    rooms_out = []
    for i, r in enumerate(room_polys):
        assigned_texts = [b['text'] for b in assoc.get(i, [])]
        label = canonical_label_for_texts(assigned_texts) if flags.get('labels', 'room') == 'ocr' else None
        rooms_out.append({
            'id': int(i),
            'bbox': [int(v) for v in r['bbox']],
            'area': float(r['area']),
            'assigned_texts': assigned_texts,
            'label': label
        })

    # annotated image path
    base = outprefix if outprefix else os.path.splitext(os.path.basename(image_path))[0]
    outpath = os.path.join(os.path.dirname(image_path) or '.', f"{base}_annot_verbose2.png")
    draw_output(imgp, room_polys, merged, assoc, orphan, outpath, flags)

    debug = {'rooms': len(room_polys), 'ocr_boxes': len(merged), 'regions': len(regions), 'time_s': round(time.time() - t0, 2),
             'ocr_backend': ('easyocr' if _HAS_EASYOCR else ('pytesseract' if _HAS_PYTESS else 'none'))}

    result = {'rooms': rooms_out, 'ocr_boxes': merged, 'orphan': orphan, 'annotated_image': outpath, 'debug': debug}

    if flags.get('save_json', False):
        json_path = os.path.join(os.path.dirname(image_path) or '.', f"{base}_rooms.json")
        try:
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2)
            result['rooms_json'] = json_path
        except Exception:
            pass

    return result

# ---------------- CLI ----------------
def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('image', help='input blueprint image')
    p.add_argument('--fill', action='store_true', help='fill rooms with semi-transparent green')
    p.add_argument('--thick', action='store_true', help='use thicker contours')
    p.add_argument('--labels', choices=['ocr', 'room'], default='room', help='label mode: use OCR labels or generic Room N')
    p.add_argument('--icons', default=None, help='path to directory of small PNG icons to overlay at centroids')
    p.add_argument('--no-ocr', action='store_true', help='skip OCR and only show segmentation')
    p.add_argument('--outprefix', default=None, help='output file prefix')
    p.add_argument('--merge-iou', type=float, default=0.48, help='IOU threshold when merging OCR boxes')
    p.add_argument('--force-edge', action='store_true', help='force edge-based segmentation (good for thick black-line blueprints)')
    p.add_argument('--save-json', action='store_true', help='save rooms JSON next to annotated image')
    return p.parse_args()

def main():
    args = parse_args()
    flags = {'fill': args.fill, 'thick': args.thick, 'labels': args.labels, 'icons': args.icons,
             'no_ocr': args.no_ocr, 'merge_iou': args.merge_iou, 'force_edge': args.force_edge, 'save_json': args.save_json}
    try:
        res = detect_and_annotate(args.image, outprefix=args.outprefix, flags=flags)
        print(json.dumps(res, indent=2))
        if res.get('annotated_image'):
            print("Annotated image saved:", res['annotated_image'])
        if res.get('rooms_json'):
            print("Rooms JSON saved:", res['rooms_json'])
    except Exception as e:
        tb = traceback.format_exc()
        print(json.dumps({'error': str(e), 'trace': tb}, indent=2))
        sys.exit(2)

if __name__ == "__main__":
    main()
