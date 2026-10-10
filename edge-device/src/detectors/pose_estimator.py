"""
Pose Estimation using YOLOv8-Pose or MediaPipe
"""
import cv2
import numpy as np
import onnxruntime as ort
from pathlib import Path
from typing import List, Tuple, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class Keypoint:
    x: float
    y: float
    confidence: float


@dataclass
class Pose:
    keypoints: List[Keypoint]
    bbox: Tuple[int, int, int, int]
    confidence: float


class PoseEstimator:
    def __init__(self, config):
        self.config = config
        self.session = None
        self.input_name = None
        self.output_names = None
        self._load_model()

    def _load_model(self):
        """Load ONNX model"""
        model_path = Path(self.config.path)
        if not model_path.exists():
            logger.warning(f"Pose model not found at {model_path}, using MediaPipe fallback")
            self.session = None
            return

        try:
            providers = ['CPUExecutionProvider']
            self.session = ort.InferenceSession(str(model_path), providers=providers)
            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [o.name for o in self.session.get_outputs()]
            logger.info(f"Loaded pose estimation model: {model_path}")
        except Exception as e:
            logger.error(f"Failed to load pose model: {e}")
            self.session = None

    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Preprocess frame for inference"""
        h, w = frame.shape[:2]
        input_h, input_w = self.config.input_size

        scale = min(input_w / w, input_h / h)
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(frame, (new_w, new_h))

        padded = np.full((input_h, input_w, 3), 114, dtype=np.uint8)
        padded[:new_h, :new_w] = resized

        padded = padded.astype(np.float32) / 255.0
        padded = padded.transpose(2, 0, 1)
        padded = np.expand_dims(padded, axis=0)

        return padded, scale, (new_w, new_h), (w, h)

    def estimate(self, frame: np.ndarray) -> List[Pose]:
        """Run pose estimation on frame"""
        if self.session is None:
            return self._dummy_poses(frame)

        # Preprocess
        input_tensor, scale, padded_size, original_size = self.preprocess(frame)

        # Inference
        outputs = self.session.run(self.output_names, {self.input_name: input_tensor})

        # Postprocess (simplified for YOLOv8-Pose format)
        poses = self._postprocess(outputs[0], scale, original_size)

        return poses

    def _postprocess(self, output: np.ndarray, scale: float, original_size: Tuple[int, int]) -> List[Pose]:
        """Postprocess YOLOv8-Pose output"""
        poses = []

        # YOLOv8-Pose output: [batch, num_keypoints*3 + 4 + num_classes, num_boxes]
        # Simplified - in production would need proper parsing
        return poses

    def _dummy_poses(self, frame: np.ndarray) -> List[Pose]:
        """Return dummy poses for testing"""
        h, w = frame.shape[:2]
        return [
            Pose(
                keypoints=[
                    Keypoint(w//3, h//3, 0.9),  # nose
                    Keypoint(w//3 - 20, h//3 + 30, 0.8),  # left shoulder
                    Keypoint(w//3 + 20, h//3 + 30, 0.8),  # right shoulder
                ],
                bbox=(w//4, h//4, w//2, h//2),
                confidence=0.9
            )
        ]

    def estimate_in_roi(self, frame: np.ndarray, roi: List[List[int]], person_boxes: List[Tuple[int, int, int, int]]) -> List[Pose]:
        """Estimate pose for persons within ROI"""
        poses = []
        for box in person_boxes:
            x1, y1, x2, y2 = box
            # Crop person region
            person_crop = frame[y1:y2, x1:x2]
            if person_crop.size == 0:
                continue

            person_poses = self.estimate(person_crop)
            # Adjust keypoints to original frame coordinates
            for pose in person_poses:
                adjusted_keypoints = []
                for kp in pose.keypoints:
                    adjusted_keypoints.append(Keypoint(
                        x=kp.x + x1,
                        y=kp.y + y1,
                        confidence=kp.confidence
                    ))
                pose.keypoints = adjusted_keypoints
                pose.bbox = box
                poses.append(pose)

        return poses

    def get_activity_state(self, pose: Pose) -> str:
        """Determine activity state from pose"""
        if not pose.keypoints:
            return "unknown"

        # Simple heuristic: check if person is sitting or standing
        # Using nose (0), shoulders (5,6), hips (11,12), knees (13,14)
        nose = pose.keypoints[0] if len(pose.keypoints) > 0 else None
        left_hip = pose.keypoints[11] if len(pose.keypoints) > 11 else None
        right_hip = pose.keypoints[12] if len(pose.keypoints) > 12 else None
        left_knee = pose.keypoints[13] if len(pose.keypoints) > 13 else None
        right_knee = pose.keypoints[14] if len(pose.keypoints) > 14 else None

        if not all([nose, left_hip, right_hip, left_knee, right_knee]):
            return "unknown"

        # Calculate torso angle
        hip_y = (left_hip.y + right_hip.y) / 2
        knee_y = (left_knee.y + right_knee.y) / 2
        torso_length = abs(nose.y - hip_y)
        thigh_length = abs(hip_y - knee_y)

        if thigh_length < torso_length * 0.5:
            return "sitting"
        else:
            return "standing"