"""
AI Detection Service — Person Counter using YOLOv8
SIH26245 - AI-Based Real-Time Monitoring of Training Centres

This service:
1. Starts a FastAPI server (always on, low resource)
2. A scheduler thread polls the centre class schedule and starts/stops detection
   automatically while a class slot is live (AUTO_SCHEDULE)
3. POST /start opens webcam/video + runs YOLOv8 manually (demo / override)
4. POST /stop releases webcam and stops detection
5. Serves a live annotated video stream (MJPEG) while detection is on
6. Reports counts to the backend every N seconds
"""

import os
import cv2
import numpy as np
import time
import json
import threading
from pathlib import Path
import logging
from datetime import datetime
from typing import Optional

import requests
import uvicorn
from fastapi import FastAPI, Query, Request
from starlette.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

from config import (
    BACKEND_URL, AUTH_TOKEN, DEVICE_KEY, CENTRE_ID, CAMERA_ID,
    VIDEO_SOURCE, CONFIDENCE_THRESHOLD, REPORT_INTERVAL,
    MODEL_NAME, STREAM_HOST, STREAM_PORT,
    AUTO_SCHEDULE, SCHEDULE_POLL_INTERVAL, SOURCE_MODE, NMS_IOU, PHOTO_IMGSZ,
    PERSON_CONF, CUSTOM_PERSON_CONF, ITEM_CONF, TILE_GRID, WEBCAM_IMGSZ,
    CAPTURE_WIDTH, CAPTURE_HEIGHT, STREAM_JPEG_QUALITY, IGNORE_ON_SCREEN, STREAM_FPS, INFER_INTERVAL, CLASS_CONF,
    BASE_IMGSZ, FAR_IMGSZ, FAR_MAX_HEIGHT, FAR_PASS_PHOTO, FAR_PASS_WEBCAM,
    AUTO_ROTATE, ORIENT_MODEL, AUTO_ENHANCE, STREAM_SHARPEN,
    SAVE_TRAINING_FRAMES, TRAINING_DIR, TRAINING_SAVE_INTERVAL, TRAINING_MAX_PER_DAY, CAPTURE_CLASSES, PEOPLE_MODEL,
    DEBUG_KEEP_PHOTOS, ORIENT_SMART_RECHECK, STREAM_WIDTH,
)

# ─── Logging Setup ────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ai-service")

# ─── FastAPI App ───────────────────────────────────────────────
app = FastAPI(title="SIH AI Detection Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Global State ─────────────────────────────────────────────
latest_frame: Optional[bytes] = None
latest_frame_seq: int = 0              # changes whenever a new picture is made (so the stream never repeats one)  # JPEG-encoded annotated frame
latest_count: int = 0
latest_confidence: float = 0.0
latest_items: list = []               # detected equipment/infrastructure items
detection_active: bool = False
should_stop: bool = False           # flag to signal the loop to stop
total_frames_processed: int = 0
detection_history: list = []        # last 100 detection events
detection_thread: Optional[threading.Thread] = None
model: Optional[YOLO] = None       # loaded once, reused
lock = threading.Lock()


# ─── Camera Source Mode ───────────────────────────────────────
RUNTIME_FILE = Path(__file__).parent / "runtime.json"
VALID_MODES = ("browser", "webcam", "phone")
PHONE_ACTIVE_WINDOW = 30  # seconds without a frame before the phone counts as disconnected
phone_last_frame_at: float = 0.0


def _load_source_mode() -> str:
    try:
        saved = json.loads(RUNTIME_FILE.read_text(encoding="utf-8")).get("sourceMode")
        if saved == "phone":
            saved = "browser"   # the phone app is not used for now: pictures from any remote camera arrive the same way
        if saved in VALID_MODES:
            return saved
    except Exception:
        pass
    return SOURCE_MODE if SOURCE_MODE in VALID_MODES else "browser"


source_mode: str = _load_source_mode()


# ─── Class Schedule State ─────────────────────────────────────
schedule: dict = {"activeSlot": None, "nextSlot": None, "slots": [], "fetchedAt": None}
auto_started: bool = False                 # detection was started by the scheduler
manual_stopped_slot: Optional[str] = None  # slot id the user manually stopped (do not restart it)
resolved_centre_id: str = CENTRE_ID


# One HTTP session for all backend calls: the connection is reused instead of opened every time
backend_session = requests.Session()


def _backend_headers() -> dict:
    headers = {"Content-Type": "application/json", "ngrok-skip-browser-warning": "true"}
    if DEVICE_KEY:
        headers["X-Device-Key"] = DEVICE_KEY
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    return headers


def resolve_centre_id() -> str:
    """Configured centre, else the first centre the token can see."""
    global resolved_centre_id
    if resolved_centre_id:
        return resolved_centre_id
    try:
        resp = backend_session.get(f"{BACKEND_URL}/centres", headers=_backend_headers(), timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            centres = data.get("data", data) if isinstance(data, dict) else data
            if centres and len(centres) == 1:
                resolved_centre_id = centres[0]["id"]
                log.info(f"Auto-detected the only centre: {resolved_centre_id} ({centres[0].get('name', '')})")
            elif centres:
                log.error("The backend has several centres: set CENTRE_ID in ai-service/.env to the one this camera films")
        else:
            log.error(f"Could not list centres ({resp.status_code}). Set CENTRE_ID and DEVICE_API_KEY in ai-service/.env")
    except Exception as e:
        log.warning(f"Could not auto-detect centre: {e}")
    return resolved_centre_id


def current_slot_name() -> Optional[str]:
    slot = schedule.get("activeSlot")
    return slot["name"] if slot else None


def refresh_schedule() -> bool:
    """Fetch the centre class schedule from the backend. Returns True on success."""
    centre_id = resolve_centre_id()
    if not centre_id:
        return False
    try:
        resp = backend_session.get(f"{BACKEND_URL}/centres/{centre_id}/schedule", headers=_backend_headers(), timeout=5)
        if resp.status_code != 200:
            log.warning(f"⚠️  Schedule fetch failed ({resp.status_code}): {resp.text[:120]}")
            return False
        data = resp.json()
        schedule["activeSlot"] = data.get("activeSlot")
        schedule["nextSlot"] = data.get("nextSlot")
        schedule["slots"] = data.get("slots", [])
        schedule["fetchedAt"] = datetime.now().isoformat()
        return True
    except requests.exceptions.ConnectionError:
        log.warning("⚠️  Backend not reachable, keeping last known schedule")
    except Exception as e:
        log.error(f"❌ Schedule fetch failed: {e}")
    return False


def start_detection_thread():
    """Start the detection loop thread (shared by /start and the scheduler)."""
    global detection_thread, should_stop
    should_stop = False
    detection_thread = threading.Thread(target=detection_loop, daemon=True)
    detection_thread.start()
    for _ in range(50):  # wait for the camera to open (up to 5s)
        if detection_active or should_stop:
            break
        time.sleep(0.1)


def stop_detection_thread():
    global should_stop
    should_stop = True
    if detection_thread and detection_thread.is_alive():
        detection_thread.join(timeout=3)


def scheduler_loop():
    """Start detection when a class slot goes live, stop it when the slot ends."""
    global auto_started, manual_stopped_slot
    log.info(f"🗓  Class-schedule scheduler running (every {SCHEDULE_POLL_INTERVAL}s)")
    while True:
        try:
            if refresh_schedule():
                active = schedule["activeSlot"]
                active_id = active["id"] if active else None

                if manual_stopped_slot and manual_stopped_slot != active_id:
                    manual_stopped_slot = None  # that slot is over, auto mode is armed again

                if active and not detection_active and manual_stopped_slot != active_id and source_mode == "webcam":
                    log.info(f"▶️  Class started: {active['name']} ({active['startTime']}-{active['endTime']}) — starting detection")
                    auto_started = True
                    start_detection_thread()
                elif not active and detection_active and auto_started:
                    log.info("⏹  Class ended — stopping detection")
                    stop_detection_thread()
                    auto_started = False
        except Exception as e:
            log.exception(f"Scheduler error: {e}")
        time.sleep(SCHEDULE_POLL_INTERVAL)


def resolve_video_source():
    """Convert VIDEO_SOURCE string to appropriate type."""
    src = VIDEO_SOURCE
    try:
        return int(src)
    except ValueError:
        pass
    return src


def report_to_backend(count: int, confidence: float, centre_id: str, items: list = None):
    """Send detection result (persons + items) to backend API."""
    if not centre_id:
        log.warning("No centre_id configured, skipping backend report")
        return

    active = schedule.get("activeSlot")
    payload = {
        "centreId": centre_id,
        "cameraId": CAMERA_ID,
        "detectedCount": count,
        "confidence": round(confidence, 3),
        "items": items or [],
    }
    if active:
        payload["classSlotId"] = active["id"]  # backend also derives the slot from its own clock

    headers = _backend_headers()

    try:
        resp = backend_session.post(
            f"{BACKEND_URL}/detection/report",
            json=payload,
            headers=headers,
            timeout=5,
        )
        if resp.status_code < 300:
            log.info(f"✅ Reported to backend: {count} persons (conf={confidence:.2f})")
        else:
            log.warning(f"⚠️  Backend responded {resp.status_code}: {resp.text[:200]}")
    except requests.exceptions.ConnectionError:
        log.warning("⚠️  Backend not reachable, will retry next interval")
    except Exception as e:
        log.error(f"❌ Report failed: {e}")


model_person: Optional[YOLO] = None
model_custom: Optional[YOLO] = None
model_people: Optional[YOLO] = None   # optional fine-tuned people-only model (PEOPLE_MODEL)


def warm_up():
    """
    Load every model and push two dummy photos (landscape and portrait) through the whole pipeline once.
    Without this the first real photo paid about 3.5 s for loading and first-time set-up.
    """
    try:
        started = time.time()
        ensure_model_loaded()
        for w, h in ((1280, 720), (720, 1280)):
            blank = np.full((h, w, 3), 120, dtype=np.uint8)
            upright_frame(blank)
            run_inference(blank, annotate=False)
        _orient_state.update({"deg": None, "n": 0})   # forget the dummy photo's orientation
        log.info(f"✅ Models warmed up in {time.time() - started:.1f}s: the first photo will be fast")
    except Exception as e:
        log.warning(f"Warm-up failed (the first photo will just be slower): {e}")


def ensure_model_loaded():
    """Load primary YOLOv8 model for persons + custom model for equipment if present."""
    global model_person, model_custom, model_people
    if model_person is None:
        base_name = MODEL_NAME if MODEL_NAME != "best.pt" else "yolov8s.pt"
        log.info(f"Loading primary person model: {base_name} ...")
        model_person = YOLO(base_name)
        log.info("✅ Primary person model loaded!")

    if model_people is None and PEOPLE_MODEL and os.path.exists(PEOPLE_MODEL):
        try:
            model_people = YOLO(PEOPLE_MODEL)
            log.info(f"✅ Fine-tuned people model loaded: {PEOPLE_MODEL}")
        except Exception as e:
            log.warning(f"Could not load {PEOPLE_MODEL}: {e}")

    if model_custom is None and os.path.exists("best.pt"):
        log.info("Loading custom equipment model: best.pt ...")
        try:
            model_custom = YOLO("best.pt")
            log.info(f"✅ Custom equipment model loaded! Classes: {model_custom.names}")
        except Exception as e:
            log.warning(f"Could not load best.pt: {e}")


PERSON_NAMES = ("person", "student", "trainee", "workers", "worker", "students", "trainees", "people")
# COCO classes we care about: person + classroom objects (keep in sync with DETECTABLE_CLASSES in the backend)
FILTER_CLASSES = [0, 24, 39, 56, 57, 60, 62, 63, 64, 66, 67, 73]
inference_lock = threading.Lock()  # YOLO models are not thread-safe (webcam loop + /analyze share them)


SCREEN_LABELS = ("tv", "laptop", "cell phone")


def _area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _inter(a, b):
    return max(0.0, min(a[2], b[2]) - max(a[0], b[0])) * max(0.0, min(a[3], b[3]) - max(a[1], b[1]))


def _iou(a, b):
    inter = _inter(a, b)
    union = _area(a) + _area(b) - inter
    return inter / union if union > 0 else 0.0


def _tiles(w, h, n):
    """Overlapping n x n tiles covering the frame (35% overlap so nobody is always cut in half)."""
    tw, th = min(w, int(w / n * 1.35)), min(h, int(h / n * 1.35))
    xs = [0] if n == 1 else [round(i * (w - tw) / (n - 1)) for i in range(n)]
    ys = [0] if n == 1 else [round(i * (h - th) / (n - 1)) for i in range(n)]
    return [(x, y, tw, th) for y in ys for x in xs]


def _collect(model, region, x0, y0, W, H, imgsz, conf, clip_edges, classes=None, max_height=None):
    """Run one model on one region; boxes come back normalised to the FULL frame.
    max_height (fraction of the frame) keeps only small boxes: used by the far-away pass."""
    res = model(region, classes=classes, conf=conf, iou=NMS_IOU, imgsz=imgsz, verbose=False)[0]
    rh, rw = region.shape[:2]
    out = []
    for box in res.boxes:
        bx1, by1, bx2, by2 = [float(v) for v in box.xyxy[0].tolist()]
        if clip_edges:
            # a box cut by an inner tile border is only part of a person: the neighbouring tile sees the whole one
            m = 3
            if (bx1 <= m and x0 > 0) or (by1 <= m and y0 > 0) or (bx2 >= rw - m and x0 + rw < W) or (by2 >= rh - m and y0 + rh < H):
                continue
        if max_height is not None and (by2 - by1) / H > max_height:
            continue
        out.append({
            "name": model.names[int(box.cls[0])],
            "confidence": float(box.conf[0]),
            "box": [round((x0 + bx1) / W, 4), round((y0 + by1) / H, 4), round((x0 + bx2) / W, 4), round((y0 + by2) / H, 4)],
        })
    return out


def _same_object_across_passes(a, b):
    """True when two boxes from DIFFERENT passes (full frame vs a zoomed tile) are the same physical object."""
    if a["name"] != b["name"] or a["_pass"] == b["_pass"]:
        return False
    if _iou(a["box"], b["box"]) > 0.4:
        return True
    # a zoomed tile often boxes only part of a big person (head and shoulders): that part lies inside the whole-person box
    small = min(_area(a["box"]), _area(b["box"]))
    return small > 0 and _inter(a["box"], b["box"]) / small > 0.8


def _merge_passes(dets):
    """Each real object must count once, however many passes saw it. Highest confidence wins."""
    kept = []
    for d in sorted(dets, key=lambda x: -x["confidence"]):
        if any(_same_object_across_passes(k, d) for k in kept):
            continue
        kept.append(d)
    return kept


def _min_conf(name):
    return CLASS_CONF.get(name, ITEM_CONF)


def _one_label_per_object(items):
    """The same object must not be reported under two names (a chair that is also a 'laptop'): keep the surest."""
    kept = []
    for d in sorted(items, key=lambda x: -x["confidence"]):
        if any(k["label"] != d["label"] and _iou(k["box"], d["box"]) > 0.6 for k in kept):
            continue
        kept.append(d)
    return kept


def _drop_people_on_screens(persons, others):
    """A person shown inside a detected TV / laptop / phone screen is not in the room."""
    screens = [o["box"] for o in others if o["label"] in SCREEN_LABELS]
    kept, ignored = [], 0
    for p in persons:
        area = _area(p["box"])
        if area > 0 and any(_inter(p["box"], s) / area > 0.85 for s in screens):
            ignored += 1
        else:
            kept.append(p)
    return kept, ignored


model_orient = None

DEBUG_PHOTOS_DIR = Path(__file__).parent / "debug_photos"


def save_debug_photo(annotated, people: int):
    """Keep a rolling set of the latest annotated photos (see DEBUG_KEEP_PHOTOS in config.py)."""
    if DEBUG_KEEP_PHOTOS <= 0:
        return
    try:
        DEBUG_PHOTOS_DIR.mkdir(exist_ok=True)
        h, w = annotated.shape[:2]
        scale = min(1.0, 1280 / max(h, w))
        small = cv2.resize(annotated, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else annotated
        name = datetime.now().strftime("%Y%m%d_%H%M%S") + f"_{people}people.jpg"
        cv2.imwrite(str(DEBUG_PHOTOS_DIR / name), small, [cv2.IMWRITE_JPEG_QUALITY, 85])
        for old in sorted(DEBUG_PHOTOS_DIR.glob("*.jpg"))[:-DEBUG_KEEP_PHOTOS]:
            old.unlink(missing_ok=True)
    except Exception as e:
        log.warning(f"Could not save debug photo: {e}")


_training_state = {"last": 0.0, "day": "", "saved_today": 0}
_training_lock = threading.Lock()


def maybe_save_training_frame(clean_frame, detections, source):
    """
    Keep a sample of what the cameras see, as a YOLO-format training example: the clean upright photo plus the
    boxes the model guessed. The guesses are only a starting point; they must be reviewed (review_capture.py)
    before training, otherwise the model would just learn its own mistakes.
    """
    if not SAVE_TRAINING_FRAMES:
        return
    now = time.time()
    today = datetime.now().strftime("%Y-%m-%d")
    with _training_lock:
        if _training_state["day"] != today:
            _training_state.update({"day": today, "saved_today": 0})
        if now - _training_state["last"] < TRAINING_SAVE_INTERVAL or _training_state["saved_today"] >= TRAINING_MAX_PER_DAY:
            return
        _training_state["last"] = now
        _training_state["saved_today"] += 1

    try:
        base = Path(__file__).parent / TRAINING_DIR
        (base / "images").mkdir(parents=True, exist_ok=True)
        (base / "labels").mkdir(parents=True, exist_ok=True)
        classes_file = base / "classes.txt"
        if not classes_file.exists():
            classes_file.write_text("\n".join(CAPTURE_CLASSES), encoding="utf-8")

        stem = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3] + f"_{source}"
        cv2.imwrite(str(base / "images" / f"{stem}.jpg"), clean_frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
        lines = []
        for d in detections:
            if d["label"] not in CAPTURE_CLASSES:
                continue
            x1, y1, x2, y2 = d["box"]
            lines.append(f"{CAPTURE_CLASSES.index(d['label'])} {(x1 + x2) / 2:.6f} {(y1 + y2) / 2:.6f} {x2 - x1:.6f} {y2 - y1:.6f}")
        (base / "labels" / f"{stem}.txt").write_text("\n".join(lines), encoding="utf-8")
    except Exception as e:
        log.warning(f"Could not save training frame: {e}")


def enhance_frame(frame):
    """Dark rooms hide people from the model and look muddy on screen: lift the shadows (CLAHE on brightness)."""
    if not AUTO_ENHANCE:
        return frame
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    if float(gray.mean()) >= 85:
        return frame
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def fit_for_stream(frame, max_side=None):
    """Smaller copy for people to watch. max_side limits the longest side (STREAM_WIDTH, or None for width only)."""
    if STREAM_WIDTH <= 0:
        return frame
    h, w = frame.shape[:2]
    longest = max(h, w) if max_side else w
    limit = max_side or STREAM_WIDTH
    if longest <= limit:
        return frame
    scale = limit / longest
    return cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def configure_capture(cap, source):
    """Ask a webcam for the best picture it really supports (webcams default to 640x480)."""
    if not isinstance(source, int):
        return
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)   # always the newest frame, no growing lag
    cap.set(cv2.CAP_PROP_AUTOFOCUS, 1)
    for w, h in ((CAPTURE_WIDTH, CAPTURE_HEIGHT), (1920, 1080), (1280, 720), (640, 480)):
        if w > CAPTURE_WIDTH:
            continue
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
        ok, probe = cap.read()
        if ok and probe.shape[1] >= 0.9 * w:
            break
    log.info(f"Camera opened at {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")


def sharpen_for_display(frame):
    """Light unsharp mask so the preview looks crisp. Only used for what people watch, never for counting."""
    if not STREAM_SHARPEN:
        return frame
    return cv2.addWeighted(frame, 1.35, cv2.GaussianBlur(frame, (0, 0), 1.2), -0.35, 0)


ORIENT_RECHECK_EVERY = 10
_orient_state = {"deg": None, "n": 0, "last_full": 0, "last_people": 0}
_ROTATIONS = ((0, None), (90, cv2.ROTATE_90_CLOCKWISE), (180, cv2.ROTATE_180), (270, cv2.ROTATE_90_COUNTERCLOCKWISE))


def upright_frame(frame, force=False):
    """
    Phone photos often arrive on their side (the saved picture does not always follow how the phone was held).
    People lying sideways are invisible to the detector, so try the four orientations with a small fast model and
    keep the one where people are most clearly upright. Returns (upright_frame, degrees_rotated_clockwise).
    """
    global model_orient
    if not AUTO_ROTATE:
        return frame, 0

    # A phone is rarely turned during a class: test all four ways on the first photo and every few photos
    # after that, and reuse the answer in between (a full check costs 0.5-1 s on a laptop CPU).
    # force=True: the caller suspects the phone was turned, so look at all four ways right now.
    _orient_state["n"] += 1
    if not force and _orient_state["deg"] is not None and _orient_state["n"] % ORIENT_RECHECK_EVERY != 0:
        code = dict(_ROTATIONS)[_orient_state["deg"]]
        return (frame if code is None else cv2.rotate(frame, code)), _orient_state["deg"]

    with inference_lock:
        if model_orient is None:
            model_orient = YOLO(ORIENT_MODEL)
        scores = {}
        for deg, code in _ROTATIONS:
            img = frame if code is None else cv2.rotate(frame, code)
            r = model_orient(img, classes=[0], conf=0.35, imgsz=384, verbose=False)[0]
            scores[deg] = float(sum(r.boxes.conf.tolist()))
    best = max(scores, key=scores.get)
    # stay as received unless another orientation is clearly better
    if best != 0 and scores[best] < scores[0] * 1.25 + 0.3:
        best = 0
    if best:
        log.info(f"Photo arrived rotated: turned {best} degrees (people scores {scores})")
    _orient_state["deg"] = best
    _orient_state["last_full"] = _orient_state["n"]
    code = dict(_ROTATIONS)[best]
    return (frame if code is None else cv2.rotate(frame, code)), best


def draw_detections(frame, detections):
    """Draw boxes (normalised coordinates) on a copy of the frame."""
    out = frame.copy()
    height, width = out.shape[:2]
    thickness = max(2, width // 400)
    font_scale = max(0.5, width / 1600)
    for d in detections:
        x1, y1 = int(d["box"][0] * width), int(d["box"][1] * height)
        x2, y2 = int(d["box"][2] * width), int(d["box"][3] * height)
        color = (127, 255, 0) if d["label"] == "person" else (0, 145, 255)  # BGR
        cv2.rectangle(out, (x1, y1), (x2, y2), color, thickness)
        cv2.putText(out, f"{d['label']} {int(d['confidence'] * 100)}%", (x1, max(18, y1 - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, thickness)
    return out


def run_inference(frame, imgsz=None, tiled=False, annotate=True, far_pass=False):
    """
    Run the models on one BGR frame.
    Returns (person_count, avg_person_conf, items_list, annotated_frame, detections, image_size).
    `detections` holds every box as {label, confidence, box:[x1,y1,x2,y2] normalised 0..1}.
    - tiled=True also scans zoomed tiles so small / far people and tools are found.
    - A person found by two passes or both models is counted once.
    """
    ensure_model_loaded()
    frame = enhance_frame(frame)
    height, width = frame.shape[:2]
    raw = []
    custom_people = []
    conf_floor = min(PERSON_CONF, ITEM_CONF)

    base = imgsz or BASE_IMGSZ
    with inference_lock:
        # pass 0: whole frame at the size the model was trained for (best for people near the camera)
        coco_filter = FILTER_CLASSES if len(model_person.names) == 80 else None  # a fine-tuned classroom model has its own classes
        for d in _collect(model_person, frame, 0, 0, width, height, base, conf_floor, False, coco_filter):
            d["_pass"] = 0
            raw.append(d)

        # far pass: sharper look, but only SMALL boxes are kept (big people here come out split in pieces)
        if far_pass and FAR_IMGSZ > base:
            for d in _collect(model_person, frame, 0, 0, width, height, FAR_IMGSZ, conf_floor, False, coco_filter, max_height=FAR_MAX_HEIGHT):
                d["_pass"] = 1
                raw.append(d)

        if tiled and TILE_GRID >= 2:
            for idx, (x, y, w, h) in enumerate(_tiles(width, height, TILE_GRID), start=2):
                for d in _collect(model_person, frame[y:y + h, x:x + w], x, y, width, height, base, conf_floor, True, coco_filter):
                    d["_pass"] = idx
                    raw.append(d)

        # A fine-tuned people model replaces the stock model's people (equipment still comes from the stock model)
        if model_people is not None:
            people = [d for d in _collect(model_people, frame, 0, 0, width, height, base, PERSON_CONF, False) if d["name"].lower() in PERSON_NAMES]
            raw = [d for d in raw if d["name"].lower() not in PERSON_NAMES]
            for d in people:
                d["_pass"] = 0
                raw.append(d)

        # Custom model (best.pt): full frame only; it may only ADD people the main model missed
        if model_custom is not None:
            try:
                for d in _collect(model_custom, frame, 0, 0, width, height, base, min(CUSTOM_PERSON_CONF, ITEM_CONF), False):
                    custom_people.append(d)
            except Exception as e:
                log.warning(f"Custom model error: {e}")

    persons, others = [], []
    for d in _merge_passes(raw):
        if d["name"].lower() in PERSON_NAMES:
            if d["confidence"] >= PERSON_CONF:
                persons.append({"label": "person", "confidence": round(d["confidence"], 3), "box": d["box"]})
        elif d["confidence"] >= _min_conf(d["name"]):
            others.append({"label": d["name"], "confidence": round(d["confidence"], 3), "box": d["box"]})

    for d in custom_people:
        if d["name"].lower() in PERSON_NAMES:
            if d["confidence"] >= CUSTOM_PERSON_CONF and all(_iou(d["box"], p["box"]) < 0.45 for p in persons):
                persons.append({"label": "person", "confidence": round(d["confidence"], 3), "box": d["box"]})
        elif d["confidence"] >= _min_conf(d["name"]):
            others.append({"label": d["name"], "confidence": round(d["confidence"], 3), "box": d["box"]})

    others = _one_label_per_object(others)

    ignored = 0
    if IGNORE_ON_SCREEN:
        persons, ignored = _drop_people_on_screens(persons, others)
        if ignored:
            log.info(f"Ignored {ignored} person(s) shown on a screen")

    detections = persons + others

    # Draw exactly what was counted, so the preview always matches the number
    annotated = draw_detections(frame, detections) if annotate else frame

    item_stats = {}
    for d in others:
        item_stats.setdefault(d["label"], {"count": 0, "confs": []})
        item_stats[d["label"]]["count"] += 1
        item_stats[d["label"]]["confs"].append(d["confidence"])
    items_list = [
        {"name": k, "count": v["count"], "confidence": round(sum(v["confs"]) / len(v["confs"]), 3)}
        for k, v in item_stats.items()
    ]
    avg_person_conf = float(sum(p["confidence"] for p in persons) / len(persons)) if persons else 0.0
    return len(persons), avg_person_conf, items_list, annotated, detections, {"width": width, "height": height}


def detection_loop():
    """Main detection loop — runs in a background thread."""
    global latest_frame, latest_frame_seq, latest_count, latest_confidence, latest_items
    global detection_active, total_frames_processed, should_stop

    ensure_model_loaded()

    # Open video source
    source = resolve_video_source()
    log.info(f"Opening video source: {source}")
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        log.error(f"❌ Failed to open video source: {source}")
        detection_active = False
        return

    configure_capture(cap, source)

    detection_active = True
    should_stop = False
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_delay = 1.0 / fps
    last_report_time = 0
    log.info(f"▶️  Detection started! Source FPS: {fps:.0f}")

    centre_id = resolve_centre_id()

    # The model runs in a background worker about once a second; the video itself plays at camera speed
    # with the latest boxes drawn on every frame. (Before, the preview only moved after each model run.)
    shared = {"frame": None, "id": 0, "result": None}
    state_lock = threading.Lock()
    stop_worker = threading.Event()

    def inference_worker():
        last_id = -1
        while not stop_worker.is_set():
            with state_lock:
                frame_in, fid = shared["frame"], shared["id"]
            if frame_in is None or fid == last_id:
                time.sleep(0.02)
                continue
            last_id = fid
            started = time.time()
            try:
                count, conf, items, _img, dets, _size = run_inference(frame_in, WEBCAM_IMGSZ, annotate=False, far_pass=FAR_PASS_WEBCAM)
                with state_lock:
                    shared["result"] = (count, conf, items, dets)
                maybe_save_training_frame(frame_in, dets, "webcam")
            except Exception as e:
                log.warning(f"Inference failed: {e}")
            stop_worker.wait(max(0.0, INFER_INTERVAL - (time.time() - started)))

    worker = threading.Thread(target=inference_worker, daemon=True)
    worker.start()
    stream_delay = 1.0 / max(1, STREAM_FPS)
    last_result_id = None
    read_failures = 0
    reopen_failures = 0

    try:
        while not should_stop:
            loop_started = time.time()
            ret, frame = cap.read()

            if not ret:
                if isinstance(source, str):
                    log.info("🔁 Video ended, looping...")
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                else:
                    # A USB hiccup or a slow start must not switch the camera off for good: wait, then try again,
                    # then re-open the camera. Only give up when it really is gone.
                    read_failures += 1
                    if read_failures < 30:
                        time.sleep(0.1)
                        continue
                    reopen_failures += 1
                    if reopen_failures > 3:
                        log.error("Camera is not delivering frames and could not be re-opened: stopping")
                        break
                    log.warning(f"Camera stopped delivering frames: re-opening it (attempt {reopen_failures} of 3)")
                    cap.release()
                    time.sleep(1.0)
                    cap = cv2.VideoCapture(source)
                    configure_capture(cap, source)
                    read_failures = 0
                    continue

            read_failures = 0
            reopen_failures = 0
            total_frames_processed += 1
            with state_lock:
                shared["frame"] = frame
                shared["id"] += 1
                result = shared["result"]

            if result is None:
                person_count, avg_person_conf, items_list, dets = 0, 0.0, [], []
            else:
                person_count, avg_person_conf, items_list, dets = result
                if id(result) != last_result_id:
                    last_result_id = id(result)
                    with lock:
                        latest_count = person_count
                        latest_confidence = avg_person_conf
                        latest_items = items_list

            annotated = draw_detections(sharpen_for_display(enhance_frame(fit_for_stream(frame))), dets)  # boxes are 0..1, so they fit any size

            # Overlay summary text
            items_summary = ", ".join(f"{it['name']}:{it['count']}" for it in items_list[:3])
            overlay_text = ("Analysing..." if result is None else f"Persons: {person_count}") + (f" | Items: {items_summary}" if items_summary else "")
            scale = max(0.6, annotated.shape[1] / 1280)

            (tw, th), _ = cv2.getTextSize(overlay_text, cv2.FONT_HERSHEY_SIMPLEX, 1.0 * scale, 3)
            cv2.rectangle(annotated, (10, 10), (30 + tw, 20 + th + int(60 * scale)), (0, 0, 0), -1)
            cv2.putText(annotated, overlay_text, (20, 10 + th), cv2.FONT_HERSHEY_SIMPLEX, 1.0 * scale, (0, 255, 0), 3)

            ts_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(annotated, ts_text, (20, 10 + th + int(28 * scale)), cv2.FONT_HERSHEY_SIMPLEX, 0.6 * scale, (255, 255, 255), 1)

            session_text = f"Session: {current_slot_name() or 'no class in session'}"
            cv2.putText(annotated, session_text, (20, 10 + th + int(52 * scale)), cv2.FONT_HERSHEY_SIMPLEX, 0.6 * scale, (0, 200, 255), 1)

            # Encode to JPEG
            _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, STREAM_JPEG_QUALITY])
            with lock:
                latest_frame = buffer.tobytes()
                latest_frame_seq += 1

            # ── Report to Backend (latest model result, every REPORT_INTERVAL) ──
            now = time.time()
            if result is not None and now - last_report_time >= REPORT_INTERVAL:
                last_report_time = now

                event = {
                    "timestamp": datetime.now().isoformat(),
                    "count": person_count,
                    "confidence": round(avg_person_conf, 3),
                    "items": items_list,
                    "session": current_slot_name(),
                }
                detection_history.append(event)
                if len(detection_history) > 100:
                    detection_history.pop(0)

                threading.Thread(
                    target=report_to_backend,
                    args=(person_count, avg_person_conf, centre_id, items_list),
                    daemon=True,
                ).start()

            time.sleep(max(0.0, stream_delay - (time.time() - loop_started)))

    except Exception as e:
        log.exception(f"Detection loop error: {e}")
    finally:
        stop_worker.set()
        detection_active = False
        should_stop = False
        cap.release()
        with lock:
            latest_frame = None
        log.info("⏹  Detection stopped, camera released")


# ─── API Endpoints ─────────────────────────────────────────────

@app.get("/")
def root():
    """Service health check."""
    return {
        "service": "SIH AI Detection Service",
        "status": "running" if detection_active else "idle",
        "model": MODEL_NAME,
        "video_source": VIDEO_SOURCE,
    }


@app.get("/status")
def get_status():
    """Get current detection status, count, and items."""
    with lock:
        return {
            "active": detection_active,
            "currentCount": latest_count,
            "confidence": round(latest_confidence, 3),
            "items": latest_items,
            "session": current_slot_name() or "OUTSIDE SESSION",
            "centreId": resolved_centre_id,
            "activeSlot": schedule.get("activeSlot"),
            "nextSlot": schedule.get("nextSlot"),
            "sourceMode": source_mode,
            "phoneActive": (time.time() - phone_last_frame_at) < PHONE_ACTIVE_WINDOW,
            "remoteActive": (time.time() - phone_last_frame_at) < PHONE_ACTIVE_WINDOW,  # pictures arriving from a web page / phone
            "phoneLastFrameAt": datetime.fromtimestamp(phone_last_frame_at).isoformat() if phone_last_frame_at else None,
            "autoSchedule": AUTO_SCHEDULE,
            "autoStarted": auto_started,
            "framesProcessed": total_frames_processed,
            "timestamp": datetime.now().isoformat(),
        }


@app.post("/start")
def start_detection():
    """Start detection manually (opens camera, begins inference)."""
    global auto_started, manual_stopped_slot

    if source_mode != "webcam":
        return {"message": "The camera is opened by the web page (browser mode). Set SOURCE_MODE=webcam to use this computer's own camera.", "active": False}

    if detection_active:
        return {"message": "Detection already running", "active": True}

    auto_started = False  # manual run: the scheduler will not stop it when the slot ends
    manual_stopped_slot = None
    start_detection_thread()

    return {
        "message": "Detection started" if detection_active else "Starting detection...",
        "active": detection_active,
        "video_feed": f"http://localhost:{STREAM_PORT}/video_feed",
    }


@app.post("/stop")
def stop_detection():
    """Stop detection (releases camera, saves battery)."""
    global latest_count, latest_confidence, latest_items, auto_started, manual_stopped_slot

    if not detection_active:
        return {"message": "Detection already stopped", "active": False}

    log.info("🛑 Stop requested — releasing camera...")
    # Do not let the scheduler immediately restart the slot that is running right now
    active = schedule.get("activeSlot")
    manual_stopped_slot = active["id"] if active else None
    auto_started = False
    stop_detection_thread()

    with lock:
        latest_count = 0
        latest_confidence = 0.0
        latest_items = []

    return {"message": "Detection stopped", "active": detection_active}


@app.post("/analyze")
async def analyze_image(request: Request):
    """
    Analyse one JPEG/PNG sent as the raw request body (used by the phone app via the backend).
    Returns the people count and detected tool counts; the backend records them against the live class slot.
    """
    global latest_frame, latest_frame_seq, latest_count, latest_confidence, latest_items, total_frames_processed, phone_last_frame_at
    body = await request.body()
    autorotate = request.query_params.get("autorotate", "1") != "0"
    if not body:
        return JSONResponse(status_code=400, content={"error": "Empty body: send the image bytes"})

    frame = cv2.imdecode(np.frombuffer(body, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        return JSONResponse(status_code=400, content={"error": "Could not decode image"})

    def _work():
        if autorotate:
            upright, degrees = upright_frame(frame)
        else:
            upright, degrees = frame, 0   # a web-page webcam picture is already upright: no guessing, no extra time
        result = run_inference(upright, far_pass=FAR_PASS_PHOTO)

        # The saved rotation can be out of date if the phone was turned: people on their side are missed (count drops)
        # or sideways objects look like extra people (count rises). So whenever the count changes, or nobody is seen
        # for a while, look at all four ways again and, if the answer changed, count this photo again the right way up.
        people = result[0]
        since_full = _orient_state["n"] - _orient_state["last_full"]
        if autorotate and ORIENT_SMART_RECHECK and (people != _orient_state["last_people"] or (people == 0 and since_full >= 3)):
            fixed, fixed_degrees = upright_frame(frame, force=True)
            if fixed_degrees != degrees:
                log.info(f"Count changed to {people} and the phone had been turned: re-counting the photo rotated {fixed_degrees} degrees")
                upright, degrees = fixed, fixed_degrees
                result = run_inference(upright, far_pass=FAR_PASS_PHOTO)
        _orient_state["last_people"] = result[0]
        maybe_save_training_frame(upright, result[4], "phone")
        return (*result, degrees)

    count, confidence, items, annotated, detections, image_size, rotation = await run_in_threadpool(_work)
    annotated = sharpen_for_display(annotated)
    save_debug_photo(annotated, count)

    _, buffer = cv2.imencode(".jpg", fit_for_stream(annotated, max_side=1280), [cv2.IMWRITE_JPEG_QUALITY, STREAM_JPEG_QUALITY])
    with lock:
        latest_count = count
        latest_confidence = confidence
        latest_items = items
        latest_frame = buffer.tobytes()
        latest_frame_seq += 1
        total_frames_processed += 1

    phone_last_frame_at = time.time()
    log.info(f"📱 Image analysed: {count} persons, {len(items)} item types")
    return {"count": count, "confidence": round(confidence, 3), "items": items, "detections": detections, "imageSize": image_size, "rotation": rotation}


@app.get("/mode")
def get_mode():
    return {"sourceMode": source_mode, "modes": list(VALID_MODES)}


@app.post("/mode")
async def set_mode(request: Request):
    """Switch the camera source between the PC webcam and the phone app. Body: {"mode": "webcam" | "phone"}"""
    global source_mode, auto_started
    try:
        mode = str((await request.json()).get("mode", "")).lower()
    except Exception:
        mode = ""
    if mode not in VALID_MODES:
        return JSONResponse(status_code=400, content={"error": "mode must be 'webcam' or 'phone'"})

    source_mode = mode
    try:
        RUNTIME_FILE.write_text(json.dumps({"sourceMode": mode}), encoding="utf-8")
    except Exception as e:
        log.warning(f"Could not persist source mode: {e}")

    # Leaving webcam mode releases the PC camera straight away
    if mode == "phone" and detection_active:
        auto_started = False
        await run_in_threadpool(stop_detection_thread)
    log.info(f"🔀 Camera source switched to: {mode}")
    return {"sourceMode": source_mode}


@app.get("/history")
def get_history(limit: int = Query(50, ge=1, le=100)):
    """Get recent detection history."""
    return detection_history[-limit:]


@app.get("/video_feed")
def video_feed():
    """Live annotated video stream (MJPEG)."""
    def generate():
        last_seq = -1
        while True:
            with lock:
                frame, seq = latest_frame, latest_frame_seq
            if frame is not None and seq != last_seq:
                last_seq = seq          # send each new picture once; repeating the last one only wastes bandwidth
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame
                    + b"\r\n"
                )
            else:
                time.sleep(0.02)

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/snapshot")
def snapshot():
    """Get a single JPEG snapshot."""
    with lock:
        frame = latest_frame
    if frame is None:
        return JSONResponse(status_code=503, content={"error": "No frame available — detection may be stopped"})
    return StreamingResponse(iter([frame]), media_type="image/jpeg")


# ─── Startup ──────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    """Pre-load model but do NOT start camera automatically."""
    log.info("=" * 60)
    log.info("  SIH AI Detection Service Ready")
    log.info(f"  Model: {MODEL_NAME}")
    log.info(f"  Video Source: {VIDEO_SOURCE}")
    log.info(f"  Backend: {BACKEND_URL}")
    log.info("")
    log.info(f"  🎥 Camera source: {source_mode.upper()} (switch on the Live Camera page)")
    log.info(f"  🗓  Auto schedule: {'ON' if AUTO_SCHEDULE else 'OFF'} (camera follows the centre class slots)")
    log.info("  ▶  POST /start to begin detection manually")
    log.info("  ⏹  POST /stop  to release camera")
    log.info(f"  📺 http://localhost:{STREAM_PORT}/video_feed")
    log.info("=" * 60)

    # Pre-load model in background so /start is instant
    threading.Thread(target=warm_up, daemon=True).start()

    if AUTO_SCHEDULE:
        threading.Thread(target=scheduler_loop, daemon=True).start()
    else:
        threading.Thread(target=refresh_schedule, daemon=True).start()


if __name__ == "__main__":
    uvicorn.run(
        "detector:app",
        host=STREAM_HOST,
        port=STREAM_PORT,
        reload=False,
        log_level="info",
    )
