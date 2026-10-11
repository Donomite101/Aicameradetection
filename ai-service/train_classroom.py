"""
Fine-tune the detector on the photos your own cameras collected and you approved (review_capture.py).

    cd ai-service
    python train_classroom.py                    # all classes (people + equipment), a drop-in replacement
    python train_classroom.py --people-only      # only people; equipment keeps coming from the stock model
    python train_classroom.py --epochs 60 --base yolov8s.pt

It never switches the live model by itself. It trains, then compares the new model with the current one on photos
the training did not see (people count exactly right, and average count error), and only saves the new weights if
they are better.
"""

import argparse
import random
import shutil
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import cv2  # noqa: E402
from ultralytics import YOLO  # noqa: E402

from config import CAPTURE_CLASSES, MODEL_NAME, TRAINING_DIR  # noqa: E402

BASE = HERE / TRAINING_DIR


def approved_pairs(people_only: bool):
    stems = set((BASE / "reviewed.txt").read_text(encoding="utf-8").split()) if (BASE / "reviewed.txt").exists() else set()
    pairs = []
    for stem in sorted(stems):
        img, lab = BASE / "images" / f"{stem}.jpg", BASE / "labels" / f"{stem}.txt"
        if img.exists() and lab.exists():
            pairs.append((img, lab))
    return pairs


def build_split(pairs, val_fraction: float, people_only: bool, seed: int = 0):
    """Copy approved photos into train/ and val/ folders (a fixed, repeatable split)."""
    out = BASE / "_split"
    if out.exists():
        shutil.rmtree(out)
    rng = random.Random(seed)
    shuffled = pairs[:]
    rng.shuffle(shuffled)
    n_val = max(1, int(len(shuffled) * val_fraction))
    parts = {"val": shuffled[:n_val], "train": shuffled[n_val:]}
    for split, items in parts.items():
        (out / split / "images").mkdir(parents=True)
        (out / split / "labels").mkdir(parents=True)
        for img, lab in items:
            shutil.copy(img, out / split / "images" / img.name)
            lines = [l for l in lab.read_text(encoding="utf-8").splitlines() if l.strip()]
            if people_only:
                lines = [l for l in lines if l.split()[0] == "0"]
            (out / split / "labels" / lab.name).write_text("\n".join(lines), encoding="utf-8")
    names = ["person"] if people_only else CAPTURE_CLASSES
    yaml = out / "classroom.yaml"
    yaml.write_text(
        f"path: {out.as_posix()}\ntrain: train/images\nval: val/images\nnc: {len(names)}\nnames: {names}\n", encoding="utf-8"
    )
    return yaml, out / "val", len(parts["train"]), len(parts["val"])


def count_quality(weights: str, val_dir: Path, person_class: int):
    """How often the model gets the number of people exactly right on photos it was not trained on."""
    model = YOLO(weights)
    exact, errs = 0, []
    images = sorted((val_dir / "images").glob("*.jpg"))
    for img in images:
        truth = sum(1 for l in (val_dir / "labels" / f"{img.stem}.txt").read_text(encoding="utf-8").splitlines() if l.strip() and int(l.split()[0]) == 0)
        pred = len(model(cv2.imread(str(img)), classes=[person_class], conf=0.30, iou=0.70, imgsz=640, verbose=False)[0].boxes)
        errs.append(abs(pred - truth))
        exact += pred == truth
    n = max(1, len(images))
    return exact / n, sum(errs) / n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=MODEL_NAME, help="weights to start from (default: the current model)")
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--val", type=float, default=0.15, help="share of photos kept aside to test the result")
    ap.add_argument("--people-only", action="store_true", help="train a people-only model (saved as classroom_people.pt)")
    ap.add_argument("--min-images", type=int, default=60, help="refuse to train on fewer approved photos than this")
    args = ap.parse_args()

    pairs = approved_pairs(args.people_only)
    print(f"Approved photos: {len(pairs)}")
    if len(pairs) < args.min_images:
        print(f"Too few to train on (need at least {args.min_images}; 200+ is much better).\n"
              f"Keep collecting (SAVE_TRAINING_FRAMES=true) and approving with review_capture.py.")
        return

    yaml, val_dir, n_train, n_val = build_split(pairs, args.val, args.people_only)
    print(f"Training on {n_train} photos, testing on {n_val} the model never sees.")

    import torch
    device = 0 if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("No NVIDIA GPU: training on the CPU is slow (many minutes per epoch with yolov8m). "
              "Use --base yolov8s.pt, or run this script on a GPU computer such as Google Colab.")

    run = f"classroom_{time.strftime('%Y%m%d_%H%M')}"
    YOLO(args.base).train(data=str(yaml), epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, device=device,
                          project=str(HERE / "runs"), name=run, patience=15, flipud=0.0, plots=False, verbose=False)
    best = HERE / "runs" / run / "weights" / "best.pt"
    if not best.exists():
        print("Training did not produce weights.")
        return

    print("\nComparing on the held-out photos (people counted exactly right):")
    base_exact, base_err = count_quality(args.base, val_dir, 0)
    new_exact, new_err = count_quality(str(best), val_dir, 0)
    print(f"  current model ({args.base}): {base_exact:.0%} exact, average error {base_err:.2f} people")
    print(f"  fine-tuned model          : {new_exact:.0%} exact, average error {new_err:.2f} people")

    target = HERE / ("classroom_people.pt" if args.people_only else "classroom_best.pt")
    if new_err < base_err or (new_err == base_err and new_exact > base_exact):
        shutil.copy(best, target)
        print(f"\nBetter. Saved as {target.name}.")
        if args.people_only:
            print("To use it:  set PEOPLE_MODEL=classroom_people.pt   then restart detector.py")
        else:
            print("To use it:  set MODEL_NAME=classroom_best.pt   then restart detector.py")
    else:
        print("\nNot better than the current model, so nothing was switched. Review and add more photos, then train again.")


if __name__ == "__main__":
    main()
