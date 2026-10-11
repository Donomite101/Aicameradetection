"""
Review the photos collected from the cameras (dataset_capture/) and fix the boxes.

The boxes in dataset_capture/ are only the model's own guesses. Training on them as they are would teach the model
its own mistakes, so every photo you want to use must be approved here first.

    cd ai-service
    python review_capture.py

In the window:
    click a box ........... delete it (click again to bring it back)
    drag on empty space ... add a box for a missed person (or the class chosen with C)
    C ..................... change the class of the next box you drag (person, laptop, chair, ...)
    Enter / Space ......... approve this photo (it will be used for training) and go to the next
    X ..................... skip for now
    R ..................... reject: this photo is not useful (moved to dataset_capture/rejected)
    U ..................... undo your last change on this photo
    B ..................... back to the previous photo
    Q / Esc ............... quit (everything you approved is already saved)
"""

import os
import shutil
import sys
from pathlib import Path

import cv2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from config import CAPTURE_CLASSES, TRAINING_DIR  # noqa: E402

BASE = HERE / TRAINING_DIR
IMAGES, LABELS = BASE / "images", BASE / "labels"
REVIEWED = BASE / "reviewed.txt"
MAX_W, MAX_H = 1400, 800
CLICK_TOLERANCE = 8  # pixels: a drag shorter than this is a click


# ───────────────────────── label files ─────────────────────────

def load_boxes(label_file: Path, w: int, h: int):
    """YOLO text file -> list of {cls, x1, y1, x2, y2 (pixels), deleted}."""
    boxes = []
    if label_file.exists():
        for line in label_file.read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            cls, cx, cy, bw, bh = int(parts[0]), *map(float, parts[1:5])
            boxes.append({
                "cls": cls, "deleted": False, "added": False,
                "x1": (cx - bw / 2) * w, "y1": (cy - bh / 2) * h, "x2": (cx + bw / 2) * w, "y2": (cy + bh / 2) * h,
            })
    return boxes


def save_boxes(label_file: Path, boxes, w: int, h: int):
    lines = []
    for b in boxes:
        if b["deleted"]:
            continue
        x1, x2 = sorted((max(0.0, min(w, b["x1"])), max(0.0, min(w, b["x2"]))))
        y1, y2 = sorted((max(0.0, min(h, b["y1"])), max(0.0, min(h, b["y2"]))))
        if x2 - x1 < 4 or y2 - y1 < 4:
            continue
        lines.append(f"{b['cls']} {(x1 + x2) / 2 / w:.6f} {(y1 + y2) / 2 / h:.6f} {(x2 - x1) / w:.6f} {(y2 - y1) / h:.6f}")
    label_file.write_text("\n".join(lines), encoding="utf-8")


def box_at(boxes, x: float, y: float):
    """Index of the smallest box under the point (so a person inside a bigger box can still be picked)."""
    hits = [(abs((b["x2"] - b["x1"]) * (b["y2"] - b["y1"])), i) for i, b in enumerate(boxes)
            if min(b["x1"], b["x2"]) <= x <= max(b["x1"], b["x2"]) and min(b["y1"], b["y2"]) <= y <= max(b["y1"], b["y2"])]
    return min(hits)[1] if hits else None


def reviewed_stems() -> set:
    return set(REVIEWED.read_text(encoding="utf-8").split()) if REVIEWED.exists() else set()


# ───────────────────────── one photo's editing state ─────────────────────────

class Editor:
    """All edits for one photo, in image pixel coordinates. The window just forwards mouse and keys to it."""

    def __init__(self, boxes, classes):
        self.boxes = boxes
        self.classes = classes
        self.new_class = 0          # class used for boxes you drag
        self.history = []           # ("delete"|"restore"|"add", index)
        self.drag_start = None
        self.drag_now = None

    def mouse_down(self, x, y):
        self.drag_start = self.drag_now = (x, y)

    def mouse_move(self, x, y):
        if self.drag_start:
            self.drag_now = (x, y)

    def mouse_up(self, x, y):
        if not self.drag_start:
            return
        (sx, sy), self.drag_start, self.drag_now = self.drag_start, None, None
        if abs(x - sx) < CLICK_TOLERANCE and abs(y - sy) < CLICK_TOLERANCE:
            i = box_at(self.boxes, x, y)
            if i is not None:
                self.boxes[i]["deleted"] = not self.boxes[i]["deleted"]
                self.history.append(("delete" if self.boxes[i]["deleted"] else "restore", i))
        else:
            self.boxes.append({"cls": self.new_class, "deleted": False, "added": True,
                               "x1": min(sx, x), "y1": min(sy, y), "x2": max(sx, x), "y2": max(sy, y)})
            self.history.append(("add", len(self.boxes) - 1))

    def cycle_class(self):
        self.new_class = (self.new_class + 1) % len(self.classes)

    def undo(self):
        if not self.history:
            return
        kind, i = self.history.pop()
        if kind == "add":
            self.boxes.pop(i)
        else:  # delete / restore both just toggle back
            self.boxes[i]["deleted"] = not self.boxes[i]["deleted"]

    def counts(self):
        kept = [b for b in self.boxes if not b["deleted"]]
        return (sum(1 for b in kept if b["cls"] == 0), sum(1 for b in self.boxes if b["added"] and not b["deleted"]),
                sum(1 for b in self.boxes if b["deleted"]))


# ───────────────────────── window ─────────────────────────

def draw(img, editor, scale, status):
    out = img.copy()
    h, w = out.shape[:2]
    thick = max(2, w // 500)
    for i, b in enumerate(editor.boxes):
        p1, p2 = (int(b["x1"]), int(b["y1"])), (int(b["x2"]), int(b["y2"]))
        if b["deleted"]:
            color, name = (60, 60, 230), "DELETED"
        else:
            color = (127, 255, 0) if b["cls"] == 0 else (0, 145, 255)
            name = editor.classes[b["cls"]] if b["cls"] < len(editor.classes) else str(b["cls"])
        cv2.rectangle(out, p1, p2, color, thick)
        cv2.putText(out, name, (p1[0], max(16, p1[1] - 6)), cv2.FONT_HERSHEY_SIMPLEX, max(0.5, w / 1800), color, max(1, thick - 1))
    if editor.drag_start and editor.drag_now:
        cv2.rectangle(out, tuple(map(int, editor.drag_start)), tuple(map(int, editor.drag_now)), (255, 255, 0), thick)
    out = cv2.resize(out, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    bar = out.shape[1]
    cv2.rectangle(out, (0, 0), (bar, 58), (0, 0, 0), -1)
    cv2.putText(out, status[0], (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(out, status[1], (10, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 220, 255), 1)
    return out


def main():
    if not IMAGES.exists() or not any(IMAGES.glob("*.jpg")):
        print(f"No photos in {IMAGES}.\nTurn collection on first:  set SAVE_TRAINING_FRAMES=true  and restart detector.py")
        return
    classes = (BASE / "classes.txt").read_text(encoding="utf-8").splitlines() if (BASE / "classes.txt").exists() else CAPTURE_CLASSES
    done = reviewed_stems()
    queue = [p for p in sorted(IMAGES.glob("*.jpg")) if p.stem not in done]
    print(f"{len(queue)} photos to review ({len(done)} already approved)")
    if not queue:
        return

    state = {"editor": None, "scale": 1.0}

    def on_mouse(event, mx, my, flags, _):
        ed = state["editor"]
        if ed is None:
            return
        x, y = mx / state["scale"], my / state["scale"]
        if event == cv2.EVENT_LBUTTONDOWN:
            ed.mouse_down(x, y)
        elif event == cv2.EVENT_MOUSEMOVE:
            ed.mouse_move(x, y)
        elif event == cv2.EVENT_LBUTTONUP:
            ed.mouse_up(x, y)

    win = "Review photos (see top of review_capture.py for keys)"
    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(win, on_mouse)

    i, approved = 0, 0
    while 0 <= i < len(queue):
        path = queue[i]
        img = cv2.imread(str(path))
        if img is None:
            i += 1
            continue
        h, w = img.shape[:2]
        state["scale"] = min(1.0, MAX_W / w, MAX_H / h)
        label_file = LABELS / f"{path.stem}.txt"
        ed = Editor(load_boxes(label_file, w, h), classes)
        state["editor"] = ed

        while True:
            people, added, deleted = ed.counts()
            status = (f"photo {i + 1}/{len(queue)}  |  people: {people}  (+{added} added, -{deleted} deleted)  |  next box class: {classes[ed.new_class]}",
                      "Enter=approve  click box=delete  drag=add  C=class  U=undo  X=skip  R=reject  B=back  Q=quit")
            cv2.imshow(win, draw(img, ed, state["scale"], status))
            key = cv2.waitKey(30) & 0xFF
            if key in (13, 32):                      # Enter / Space: approve
                save_boxes(label_file, ed.boxes, w, h)
                with open(REVIEWED, "a", encoding="utf-8") as f:
                    f.write(path.stem + "\n")
                approved += 1
                i += 1
                break
            elif key in (ord("x"), ord("X")):
                i += 1
                break
            elif key in (ord("r"), ord("R")):
                rejected = BASE / "rejected"
                rejected.mkdir(exist_ok=True)
                shutil.move(str(path), rejected / path.name)
                if label_file.exists():
                    shutil.move(str(label_file), rejected / label_file.name)
                i += 1
                break
            elif key in (ord("b"), ord("B")):
                i = max(0, i - 1)
                break
            elif key in (ord("c"), ord("C")):
                ed.cycle_class()
            elif key in (ord("u"), ord("U")):
                ed.undo()
            elif key in (ord("q"), ord("Q"), 27):
                cv2.destroyAllWindows()
                print(f"Approved {approved} photos this session. Total approved: {len(reviewed_stems())}")
                return

    cv2.destroyAllWindows()
    print(f"Done. Approved {approved} photos this session. Total approved: {len(reviewed_stems())}")


if __name__ == "__main__":
    main()
