"""
Frame Extractor for Training Data Collection
SIH26245 - AI-Based Real-Time Monitoring of Training Centres

Usage:
    python extract_frames.py --video "path/to/classroom.mp4" --interval 2 --output "dataset/raw_images"
"""

import os
import cv2
import argparse

def extract_frames(video_path: str, output_dir: str, interval_seconds: float = 2.0, max_frames: int = 150):
    os.makedirs(output_dir, exist_ok=True)
    
    cap = cv2.VideoCapture(int(video_path) if video_path.isdigit() else video_path)
    if not cap.isOpened():
        print(f"❌ Error: Cannot open video source: {video_path}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_step = int(fps * interval_seconds)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if not video_path.isdigit() else "Live"
    
    print(f"🎬 Video opened: {video_path}")
    print(f"   FPS: {fps:.1f} | Frame step: every {frame_step} frames ({interval_seconds}s)")
    print(f"   Extracting up to {max_frames} frames to: {output_dir}")
    
    frame_idx = 0
    saved_count = 0
    
    while saved_count < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
            
        if frame_idx % frame_step == 0:
            out_file = os.path.join(output_dir, f"frame_{saved_count:04d}.jpg")
            cv2.imwrite(out_file, frame)
            saved_count += 1
            print(f"   Saved [{saved_count}/{max_frames}]: {out_file}")
            
        frame_idx += 1
        
    cap.release()
    print(f"\n✅ Done! Extracted {saved_count} frames to {output_dir}")
    print("👉 Next step: Upload this folder to https://roboflow.com to annotate in 5-10 minutes.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract frames from video for YOLO training")
    parser.add_argument("--video", type=str, default="0", help="Video path or webcam index (default: 0)")
    parser.add_argument("--output", type=str, default="dataset/raw_images", help="Output directory")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between extracted frames")
    parser.add_argument("--max", type=int, default=100, help="Maximum number of frames to extract")
    args = parser.parse_args()
    
    extract_frames(args.video, args.output, args.interval, args.max)
