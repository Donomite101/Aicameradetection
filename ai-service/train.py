"""
YOLOv8 Custom Model Training Script
SIH26245 - AI-Based Real-Time Monitoring of Training Centres

Usage:
    python train.py --data dataset/data.yaml --epochs 30 --base yolov8s.pt
"""

import os
import argparse
from ultralytics import YOLO

def train_model(data_yaml: str, epochs: int = 30, base_model: str = "yolov8s.pt", imgsz: int = 640, batch: int = 8):
    if not os.path.exists(data_yaml):
        print(f"❌ Error: data config file '{data_yaml}' not found!")
        print("Please prepare your dataset or download one from Roboflow with data.yaml.")
        return

    print("=" * 60)
    print("🚀 Starting YOLOv8 Transfer Learning / Fine-Tuning")
    print(f"   Base model : {base_model}")
    print(f"   Dataset    : {data_yaml}")
    print(f"   Epochs     : {epochs}")
    print(f"   Img Size   : {imgsz}")
    print(f"   Batch Size : {batch}")
    print("=" * 60)

    # Load base pretrained weights (transfers COCO knowledge)
    model = YOLO(base_model)

    # Train
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        name="classroom_detector",
        save=True,
        device=0 if os.environ.get("CUDA_VISIBLE_DEVICES") else "cpu",
        plots=True,
    )

    print("\n" + "=" * 60)
    print("🎉 Training Finished Successfully!")
    print(f"   Best weights saved at: runs/detect/classroom_detector/weights/best.pt")
    print("   To use your new model, copy 'best.pt' to ai-service/ and update config.py:")
    print("   MODEL_NAME = 'best.pt'")
    print("=" * 60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train custom YOLOv8 model")
    parser.add_argument("--data", type=str, default="dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs")
    parser.add_argument("--base", type=str, default="yolov8s.pt", help="Base model (yolov8n.pt, yolov8s.pt, yolov8m.pt)")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution for training")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    args = parser.parse_args()

    train_model(args.data, args.epochs, args.base, args.imgsz, args.batch)
