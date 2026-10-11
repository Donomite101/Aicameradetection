"""
Configuration for AI Detection Service
SIH26245 - AI-Based Real-Time Monitoring of Training Centres
"""

import os

from pathlib import Path


def _load_dotenv():
    """Read ai-service/.env (KEY=VALUE per line) so secrets and ids live in a file that is not committed."""
    env_file = Path(__file__).parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

# ─── Backend Connection ───────────────────────────────────────
# 127.0.0.1, not "localhost": on Windows "localhost" tries IPv6 first and every call waits ~2 s before falling back
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:3000/api/v1").replace("://localhost", "://127.0.0.1")

# Shared secret the backend checks (DEVICE_API_KEY in backend/.env). Set it in ai-service/.env.
DEVICE_KEY = os.getenv("DEVICE_API_KEY", "")
# Optional: a user token instead of the device key (expires, so the device key is preferred)
AUTH_TOKEN = os.getenv("AUTH_TOKEN", "")

# ─── Centre & Camera Info ─────────────────────────────────────
# Which training centre this machine films. Set CENTRE_ID in ai-service/.env. If it is empty and the backend has
# exactly one centre, that one is used.
CENTRE_ID = os.getenv("CENTRE_ID", "")
CAMERA_ID = os.getenv("CAMERA_ID", "webcam-001")

# ─── Video Source ─────────────────────────────────────────────
# 0 = laptop webcam | 1 = USB webcam | "C:/Videos/class.mp4" = video file
VIDEO_SOURCE = os.getenv("VIDEO_SOURCE", "0")

# ─── Detection Settings ──────────────────────────────────────
CONFIDENCE_THRESHOLD = 0.35
PERSON_CONF = float(os.getenv("PERSON_CONF", "0.30"))                 # people are counted from this confidence up
CUSTOM_PERSON_CONF = float(os.getenv("CUSTOM_PERSON_CONF", "0.50"))   # extra people found only by best.pt must be this sure
NMS_IOU = float(os.getenv("NMS_IOU", "0.70"))          # lower = merge overlapping boxes of one person more aggressively
# Two-pass detection. The models are trained at 640 px: people close to the camera are detected best there
# (at 1280 a big person gets split into an upper-body box and a legs box). A second, sharper pass at 1280
# only keeps SMALL (far-away) people and objects that the first pass missed. Off by default: on test scenes it
# tripled the time without finding more people than yolov8m at 640.
BASE_IMGSZ = int(os.getenv("BASE_IMGSZ", "640"))
FAR_IMGSZ = int(os.getenv("FAR_IMGSZ", "1280"))
FAR_MAX_HEIGHT = float(os.getenv("FAR_MAX_HEIGHT", "0.30"))     # far pass keeps boxes shorter than 30% of the image
FAR_PASS_PHOTO = os.getenv("FAR_PASS_PHOTO", "false").lower() in ("1", "true", "yes")
FAR_PASS_WEBCAM = os.getenv("FAR_PASS_WEBCAM", "false").lower() in ("1", "true", "yes")
PHOTO_IMGSZ = int(os.getenv("PHOTO_IMGSZ", "1280"))  # kept for compatibility     # inference size for phone photos (small/far people need more pixels)
REPORT_INTERVAL = 2    # seconds between backend reports (the webcam path; phone photos report as they arrive)
MODEL_NAME = os.getenv("MODEL_NAME", "yolov8s.pt")   # the model used from the start. yolov8m.pt is a bit more accurate for crowded groups but ~35% slower

# ─── Accuracy & quality ───────────────────────────────────────
# Confidence an object must reach before it is recorded. Look-alike classes need more proof, so a chair
# is not read as a laptop; anything not listed uses ITEM_CONF.
CLASS_CONF = {
    "laptop": 0.55, "tv": 0.50, "cell phone": 0.45, "couch": 0.50, "keyboard": 0.40, "mouse": 0.40,
    "chair": 0.30, "dining table": 0.35, "book": 0.30, "bottle": 0.35, "backpack": 0.35,
}
ITEM_CONF = float(os.getenv("ITEM_CONF", "0.25"))               # tools / objects are recorded from this confidence up
TILE_GRID = int(os.getenv("TILE_GRID", "0"))                    # phone photos: also scan an N x N grid of zoomed tiles (0 = off, 3 = slower, finds smaller)
WEBCAM_IMGSZ = int(os.getenv("WEBCAM_IMGSZ", "512"))             # live webcam view: 512 makes the same count decisions as 640 here, ~35% faster
CAPTURE_WIDTH = int(os.getenv("CAPTURE_WIDTH", "1920"))         # best webcam resolution to ask for (falls back to what the camera supports)
CAPTURE_HEIGHT = int(os.getenv("CAPTURE_HEIGHT", "1080"))
AUTO_ROTATE = os.getenv("AUTO_ROTATE", "true").lower() in ("1", "true", "yes")   # phone photos often arrive sideways: turn them upright first
ORIENT_MODEL = os.getenv("ORIENT_MODEL", "yolov8n.pt")                          # small, fast model that only decides which way is up
AUTO_ENHANCE = os.getenv("AUTO_ENHANCE", "true").lower() in ("1", "true", "yes")  # brighten dark rooms before detecting / showing
# When the count of a phone photo changes, look at all four rotations again straight away (the phone may have been turned)
ORIENT_SMART_RECHECK = os.getenv("ORIENT_SMART_RECHECK", "true").lower() in ("1", "true", "yes")
STREAM_SHARPEN = os.getenv("STREAM_SHARPEN", "true").lower() in ("1", "true", "yes")
STREAM_FPS = int(os.getenv("STREAM_FPS", "10"))                    # smooth preview; the model runs separately, about once a second
INFER_INTERVAL = float(os.getenv("INFER_INTERVAL", "0.1"))      # pause between webcam model runs: 0.1 = detect as fast as the CPU allows
STREAM_JPEG_QUALITY = int(os.getenv("STREAM_JPEG_QUALITY", "70"))
# The picture people WATCH is a smaller copy (the model still sees the full frame). A full 1080p stream at 92% quality
# was 3.5 MB/s: far too much for Wi-Fi or a tunnel, and it made the page stall and flicker. 854 px / 70% / 10 fps is a few Mbit/s.
STREAM_WIDTH = int(os.getenv("STREAM_WIDTH", "854"))            # 0 = send the full camera size
IGNORE_ON_SCREEN = os.getenv("IGNORE_ON_SCREEN", "true").lower() in ("1", "true", "yes")  # do not count people shown on a TV / laptop / phone screen

# ─── Camera Source ────────────────────────────────────────────
# "browser" = the camera is opened by the WEB PAGE (any laptop) and sends pictures here: this PC opens no camera
# "webcam" = this PC's webcam/video file (started automatically at class time)
# "phone"  = frames pushed by the mobile app through the backend (POST /analyze)
# Can be switched at runtime from the Live Camera page; the last choice is remembered in runtime.json.
SOURCE_MODE = os.getenv("SOURCE_MODE", "browser").lower()

# ─── Training data collection ─────────────────────────────────
# When on, the service keeps a sample of what the cameras see (clean, upright photo + the boxes it guessed) in
# dataset_capture/ so the model can later be fine-tuned on YOUR rooms. Photos of people stay on this PC.
SAVE_TRAINING_FRAMES = os.getenv("SAVE_TRAINING_FRAMES", "false").lower() in ("1", "true", "yes")
TRAINING_DIR = os.getenv("TRAINING_DIR", "dataset_capture")
TRAINING_SAVE_INTERVAL = int(os.getenv("TRAINING_SAVE_INTERVAL", "30"))   # at most one saved photo per this many seconds
TRAINING_MAX_PER_DAY = int(os.getenv("TRAINING_MAX_PER_DAY", "300"))
# A people-only model you trained with train_classroom.py --people-only: it takes over people counting,
# the stock model keeps finding the equipment.
PEOPLE_MODEL = os.getenv("PEOPLE_MODEL", "")
# Label numbers used in the saved dataset (person first, then the equipment the centres can register)
CAPTURE_CLASSES = ["person", "laptop", "keyboard", "mouse", "tv", "chair", "dining table", "couch", "book", "cell phone", "bottle", "backpack"]

# ─── Debug photos ─────────────────────────────────────────────
# The last N annotated photos from the phone are kept in ai-service/debug_photos/ (people count in the file name),
# so when a count looks wrong you can open the picture and see exactly what the model saw. 0 = off.
DEBUG_KEEP_PHOTOS = int(os.getenv("DEBUG_KEEP_PHOTOS", "40"))

# ─── Class Schedule ───────────────────────────────────────────
# When true, detection starts/stops automatically with the centre's class slots
AUTO_SCHEDULE = os.getenv("AUTO_SCHEDULE", "true").lower() in ("1", "true", "yes")
SCHEDULE_POLL_INTERVAL = int(os.getenv("SCHEDULE_POLL_INTERVAL", "30"))  # seconds

# ─── Stream Server ────────────────────────────────────────────
# Only this computer by default (the backend and the web page talk to it locally). Use 0.0.0.0 only on a trusted network.
STREAM_HOST = os.getenv("STREAM_HOST", "127.0.0.1")
STREAM_PORT = 8000
