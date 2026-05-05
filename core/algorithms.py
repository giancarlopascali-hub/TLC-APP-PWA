import numpy as np
import base64
from PIL import Image
import io
import hashlib
import cv2
from scipy.signal import find_peaks
from scipy.ndimage import gaussian_filter1d, median_filter, distance_transform_edt

# ── Image Handling ────────────────────────────────────────────────────────────

_cache = {}

def load_image(b64str: str) -> np.ndarray:
    """Decode base64 image → uint8 BGR array, cached."""
    key = hashlib.md5(b64str.encode()).hexdigest() + "_color"
    if key not in _cache:
        raw = base64.b64decode(b64str.split(',')[-1])
        pil = Image.open(io.BytesIO(raw)).convert('RGB')
        _cache[key] = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        if len(_cache) > 40:
            del _cache[next(iter(_cache))]
    return _cache[key]

def load_gray(b64str: str) -> np.ndarray:
    """Decode base64 image → uint8 grayscale array, cached."""
    key = hashlib.md5(b64str.encode()).hexdigest() + "_gray"
    if key not in _cache:
        color = load_image(b64str)
        _cache[key] = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
    return _cache[key]

def apply_bg_norm(gray: np.ndarray, bg_rect: list = None):
    """Normalize image based on a reference background rect [x, y, w, h]."""
    gray_f = gray.astype(np.float64) / 255.0
    bg_val = 1.0
    
    if bg_rect and len(bg_rect) == 4:
        x, y, w, h = [int(v) for v in bg_rect]
        H, W = gray.shape
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(W, x + w), min(H, y + h)
        
        if x1 > x0 and y1 > y0:
            roi = gray_f[y0:y1, x0:x1]
            bg_val = float(np.median(roi))
            # Gain Correction: background moves to 1.0
            normed = np.clip(gray_f / (bg_val + 1e-6), 0, 1.0)
            return normed, bg_val
            
    return gray_f, bg_val

# ── Detection Algorithms ──────────────────────────────────────────────────────

def run_log_detection(image_b64, bg_rect=None, **params):
    from skimage.feature import blob_log
    gray = load_gray(image_b64)
    normed, bg_v = apply_bg_norm(gray, bg_rect)

    min_sigma = float(params.get('min_sigma', 2.0))
    max_sigma = float(params.get('max_sigma', 20.0))
    threshold = float(params.get('threshold', 0.04))
    num_sigma = int(params.get('num_sigma', 10))
    overlap = float(params.get('overlap', 0.5))
    min_area = float(params.get('min_area', 0.0))
    max_area = float(params.get('max_area', 999999.0))

    gray_inv = 1.0 - normed
    blobs = blob_log(gray_inv, min_sigma=min_sigma, max_sigma=max_sigma,
                     threshold=threshold, num_sigma=num_sigma, overlap=overlap)

    spots = []
    for y, x, sigma in blobs:
        r = max(2.0, sigma * np.sqrt(2))
        area = np.pi * (r ** 2)
        if area < min_area or area > max_area:
            continue
        spots.append({
            'cx': round(float(x), 1),
            'cy': round(float(y), 1),
            'bbox': [max(0, int(x - r)), max(0, int(y - r)), int(2 * r), int(2 * r)],
            'radius': round(float(r), 1),
        })
    return spots, bg_v

def run_adaptive_detection(image_b64, bg_rect=None, **params):
    from skimage.filters import threshold_local, gaussian
    from skimage.morphology import disk, binary_opening
    from skimage.measure import label, regionprops
    
    gray = load_gray(image_b64)
    normed, bg_v = apply_bg_norm(gray, bg_rect)

    block_size = int(params.get('block_size', 51))
    if block_size % 2 == 0: block_size += 1
    offset = float(params.get('offset', 0.02))
    min_area = int(params.get('min_area', 30))
    max_area = int(params.get('max_area', 999999))
    smoothing = float(params.get('smoothing', 0.0))
    morph_disk = int(params.get('morphology', 2))

    if smoothing > 0:
        normed = gaussian(normed, sigma=smoothing)

    local_thresh = threshold_local(normed, block_size=block_size, method='gaussian')
    binary = normed < (local_thresh - offset)
    if morph_disk > 0:
        binary = binary_opening(binary, footprint=disk(morph_disk))

    spots = []
    for rp in regionprops(label(binary)):
        if rp.area < min_area or rp.area > max_area:
            continue
        cy, cx = rp.centroid
        r0, c0, r1, c1 = rp.bbox
        spots.append({
            'cx': round(float(cx), 1),
            'cy': round(float(cy), 1),
            'bbox': [int(c0), int(r0), int(c1 - c0), int(r1 - r0)],
        })
    return spots, bg_v

def run_watershed_detection(image_b64, bg_rect=None, **params):
    from skimage.filters import gaussian as gf, threshold_otsu
    from skimage.morphology import disk, binary_opening
    from skimage.segmentation import watershed
    from skimage.feature import peak_local_max
    from skimage.measure import label, regionprops
    
    gray = load_gray(image_b64)
    normed, bg_v = apply_bg_norm(gray, bg_rect)

    smoothing = float(params.get('smoothing', 2.0))
    min_dist = int(params.get('min_dist', 25))
    offset = float(params.get('offset', 0.0))
    min_area = int(params.get('min_area', 30))
    max_area = int(params.get('max_area', 9999))

    inv = 1.0 - normed
    smoothed = gf(inv, sigma=smoothing)
    try:
        thresh = threshold_otsu(smoothed) + offset
    except: thresh = 0.5
    
    binary = (smoothed > thresh)
    binary = binary_opening(binary, footprint=disk(2))

    dist_map = distance_transform_edt(binary)
    coords = peak_local_max(dist_map, min_distance=min_dist, labels=binary.astype(np.uint8))
    
    spots = []
    if len(coords) > 0:
        markers = np.zeros(gray.shape, dtype=np.int32)
        markers[tuple(coords.T)] = np.arange(1, len(coords) + 1)
        ws_labels = watershed(-dist_map, markers, mask=binary)
        for rp in regionprops(ws_labels):
            if min_area <= rp.area <= max_area:
                cy, cx = rp.centroid
                r0, c0, r1, c1 = rp.bbox
                
                mask_idx = (ws_labels[r0:r1, c0:c1] == rp.label).astype(np.uint8)
                cnts, _ = cv2.findContours(mask_idx, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                cnt_list = []
                if len(cnts) > 0:
                    for pt in cnts[0]:
                        cnt_list.append([int(pt[0][0]), int(pt[0][1])])
                
                spots.append({
                    'cx': round(float(cx), 1),
                    'cy': round(float(cy), 1),
                    'bbox': [int(c0), int(r0), int(c1 - c0), int(r1 - r0)],
                    'contour': cnt_list
                })
    return spots, bg_v

def run_line_detection(image_b64, bg_rect=None):
    gray = load_gray(image_b64)
    H, W = gray.shape
    
    if bg_rect:
        x, y, w, h = [int(v) for v in bg_rect]
        bg_roi = gray[max(0,y):min(H,y+h), max(0,x):min(W,x+w)]
        if bg_roi.size > 0:
            bg_med = np.median(bg_roi)
            gray = np.clip((gray.astype(np.float32) / (bg_med + 1e-6)) * 200, 0, 255).astype(np.uint8)

    sob = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    sob = np.abs(sob)
    proj = np.mean(sob, axis=1)
    
    peaks, _ = find_peaks(proj, height=np.mean(proj)*2.0, distance=30)
    
    lines = []
    for p in peaks:
        lines.append({
            'x1': int(W * 0.05), 'y1': int(p),
            'x2': int(W * 0.95), 'y2': int(p)
        })
    return lines

def run_optimization(image_b64, model_type='adaptive', plate_boxes=None, bg_rect=None):
    from skopt import gp_minimize
    from skopt.space import Real, Integer
    from skimage.filters import threshold_local, gaussian, threshold_otsu
    from skimage.morphology import disk, binary_opening
    from skimage.measure import label, regionprops
    from skimage.segmentation import watershed
    from skimage.feature import peak_local_max
    
    gray = load_gray(image_b64)
    H, W = gray.shape
    
    mask = np.zeros_like(gray, dtype=np.uint8)
    if plate_boxes:
        for b in plate_boxes:
            x1, y1, x2, y2 = int(b[0]), int(b[1]), int(b[2]), int(b[3])
            mask[max(0,y1):min(H,y2), max(0,x1):min(W,x2)] = 1
    else:
        mask[:] = 1
        
    normed, _ = apply_bg_norm(gray, bg_rect)
    masked = normed * mask
    
    min_area, max_area = 50, 1500
    best_spots = []
    best_params = {}

    if model_type == 'adaptive':
        space = [Real(-0.04, 0.12, name='offset'), Integer(11, 251, name='window'), Real(0.0, 5.0, name='smoothing')]
        footprint = disk(2)
        def objective(params):
            off, win, sm = params
            if win % 2 == 0: win += 1
            c_img = (gaussian(masked, sigma=sm) if sm > 0 else masked).astype(np.float32)
            lt = threshold_local(c_img, block_size=int(win), method='gaussian')
            binary = (c_img < (lt - off)) & (mask > 0)
            binary = binary_opening(binary, footprint=footprint)
            return -float(len(regionprops(label(binary))))

        res = gp_minimize(objective, space, n_calls=30, n_random_starts=15, random_state=42)
        off, win, sm = res.x
        if win % 2 == 0: win += 1
        c_img = (gaussian(masked, sigma=sm) if sm > 0 else masked).astype(np.float32)
        lt = threshold_local(c_img, block_size=int(win), method='gaussian')
        binary = (c_img < (lt - off)) & (mask > 0)
        binary = binary_opening(binary, footprint=footprint)
        for rp in regionprops(label(binary)):
            if min_area <= rp.area <= max_area:
                cy, cx = rp.centroid
                r0, c0, r1, c1 = rp.bbox
                best_spots.append({'cx': float(cx), 'cy': float(cy), 'bbox': [int(c0), int(r0), int(c1-c0), int(r1-r0)]})
        best_params = {'sensitivity': round(50 - off * 500, 1), 'window': int(win), 'smoothing': round(float(sm), 1)}

    elif model_type == 'waterfall':
        space = [Real(0.1, 6.0, name='smoothing'), Integer(5, 100, name='min_dist'), Real(-0.2, 0.2, name='offset')]
        inv = 1.0 - masked
        def objective(params):
            sm, dist, off = params
            smoothed = gaussian(inv, sigma=sm)
            try: thresh = threshold_otsu(smoothed) + off
            except: thresh = 0.5
            binary = (smoothed > thresh) & (mask > 0)
            if binary.sum() == 0: return 0
            dist_map = distance_transform_edt(binary)
            coords = peak_local_max(dist_map, min_distance=int(dist), labels=binary.astype(np.uint8))
            if len(coords) == 0: return 0
            markers = np.zeros(gray.shape, dtype=np.int32)
            markers[tuple(coords.T)] = np.arange(1, len(coords) + 1)
            ws = watershed(-dist_map, markers, mask=binary)
            return -float(len(regionprops(ws)))

        res = gp_minimize(objective, space, n_calls=30, n_random_starts=15, random_state=42)
        sm, dist, off = res.x
        smoothed = gaussian(inv, sigma=sm)
        try: thresh = threshold_otsu(smoothed) + off
        except: thresh = 0.5
        binary = (smoothed > thresh) & (mask > 0)
        dist_map = distance_transform_edt(binary)
        coords = peak_local_max(dist_map, min_distance=int(dist), labels=binary.astype(np.uint8))
        if len(coords) > 0:
            markers = np.zeros(gray.shape, dtype=np.int32)
            markers[tuple(coords.T)] = np.arange(1, len(coords) + 1)
            ws = watershed(-dist_map, markers, mask=binary)
            for rp in regionprops(ws):
                if min_area <= rp.area <= max_area:
                    cy, cx = rp.centroid
                    r0, c0, r1, c1 = rp.bbox
                    mask_idx = (ws[r0:r1, c0:c1] == rp.label).astype(np.uint8)
                    cnts, _ = cv2.findContours(mask_idx, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    cnt_list = []
                    if len(cnts) > 0:
                        for pt in cnts[0]: cnt_list.append([int(pt[0][0]), int(pt[0][1])])
                    best_spots.append({'cx': float(cx), 'cy': float(cy), 'bbox': [int(c0), int(r0), int(c1-c0), int(r1-r0)], 'contour': cnt_list})
        best_params = {'sensitivity': round((off + 0.2) * 250, 1), 'smoothing': round(float(sm), 1), 'separation': int(dist)}

    return best_spots, best_params

def generate_lane_profiles(image_b64, lanes, **params):
    img = load_gray(image_b64)
    detect_peaks_flag = params.get('peak_detection', False)
    peak_prominence = 81.0 - float(params.get('peak_prominence', 10))
    peak_distance = int(params.get('peak_distance', 5))
    smooth_sigma = float(params.get('smooth_sigma', 1.5))
    int_threshold = float(params.get('peak_threshold', 50)) / 100.0
    polarity_mode = params.get('polarity_mode', 'default')

    results = []
    for lane in lanes:
        cx, cy, lw, lh, angle = lane['cx'], lane['cy'], lane['w'], lane['h'], lane.get('angle', 0)
        M = cv2.getRotationMatrix2D((cx, cy), np.degrees(-angle), 1.0)
        straight = cv2.warpAffine(img, M, (img.shape[1], img.shape[0]))
        y1, y2 = max(0, int(cy - lh/2)), min(straight.shape[0], int(cy + lh/2))
        x1, x2 = max(0, int(cx - lw/2)), min(straight.shape[1], int(cx + lw/2))
        roi = straight[y1:y2, x1:x2]
        if roi.size == 0:
            results.append({'id': lane['id'], 'profile': [], 'peaks': []})
            continue

        raw_signal = np.mean(roi, axis=1)
        if polarity_mode == 'dark' or (polarity_mode == 'default' and np.mean(roi) < np.median(roi)):
            profile = 255.0 - raw_signal
        else:
            profile = raw_signal
        
        win = max(21, int(len(profile) * 0.50))
        if win % 2 == 0: win += 1
        background = median_filter(profile, size=win)
        profile = np.clip(profile - background, 0, None)
        profile = profile - profile.min()
        if smooth_sigma > 0:
            profile = gaussian_filter1d(profile, sigma=smooth_sigma)

        peaks_out = []
        if detect_peaks_flag and len(profile) > 4:
            p_rev = profile[::-1].copy()
            n = len(p_rev)
            p_min, p_max = p_rev.min(), p_rev.max()
            p_range = p_max - p_min
            if p_range > 1e-6:
                p_norm = (p_rev - p_min) / p_range * 100.0
                peak_indices, properties = find_peaks(p_norm, prominence=peak_prominence, distance=max(1, peak_distance))
                for i, idx in enumerate(peak_indices):
                    y_fract = 1.0 - (float(idx) / (n - 1)) if n > 1 else 0.0
                    y_origin_line, y_front_line = 1.05 / 1.10, 0.05 / 1.10
                    rf = (y_origin_line - y_fract) / (y_origin_line - y_front_line)
                    if 0.0 <= rf <= 1.0:
                        lb, rb = int(properties['left_bases'][i]), int(properties['right_bases'][i])
                        local_peak_val, local_base = p_norm[idx], min(p_norm[lb], p_norm[rb])
                        thresh_v = local_base + (local_peak_val - local_base) * int_threshold
                        v_lb, v_rb = lb, rb
                        for j in range(idx, lb, -1):
                            if p_norm[j] < thresh_v: v_lb = j; break
                        for j in range(idx, rb):
                            if p_norm[j] < thresh_v: v_rb = j; break
                        if (v_rb - v_lb) < 2: v_lb, v_rb = max(0, idx-2), min(n-1, idx+2)
                        area = float(np.trapz(np.clip(p_norm[lb:rb+1] - local_base, 0, None)))
                        peaks_out.append({'idx': int(idx), 'rf': round(rf, 3), 'height': round(float(p_rev[idx]), 2), 'area': round(area, 2), 'lb': int(v_lb), 'rb': int(v_rb)})

        results.append({'id': lane['id'], 'profile': profile.tolist(), 'peaks': peaks_out})
    return results
