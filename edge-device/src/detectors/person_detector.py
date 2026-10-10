"""
Person Detection using YOLOv8 ONNX
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
class Detection:
    bbox: Tuple[int, int, int, int]  # x1, y1, x2, y2
    confidence: float
    class_id: int
    track_id: Optional[int] = None


class PersonDetector:
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
            logger.warning(f"Model not found at {model_path}, using dummy detector")
            self.session = None
            return

        try:
            # Use CPU execution provider for edge devices
            providers = ['CPUExecutionProvider']
            self.session = ort.InferenceSession(str(model_path), providers=providers)
            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [o.name for o in self.session.get_outputs()]
            logger.info(f"Loaded person detection model: {model_path}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.session = None

    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Preprocess frame for inference"""
        h, w = frame.shape[:2]
        input_h, input_w = self.config.input_size

        # Letterbox resize
        scale = min(input_w / w, input_h / h)
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(frame, (new_w, new_h))

        # Pad to input size
        padded = np.full((input_h, input_w, 3), 114, dtype=np.uint8)
        padded[:new_h, :new_w] = resized

        # Normalize and transpose
        padded = padded.astype(np.float32) / 255.0
        padded = padded.transpose(2, 0, 1)  # HWC -> CHW
        padded = np.expand_dims(padded, axis=0)  # Add batch dim

        return padded, scale, (new_w, new_h), (w, h)

    def postprocess(self, outputs: np.ndarray, scale: float, padded_size: Tuple[int, int], original_size: Tuple[int, int]) -> List[Detection]:
        """Postprocess YOLO outputs"""
        detections = []

        if self.session is None:
            # Return dummy detections for testing
            return self._dummy_detections(original_size)

        # YOLOv8 output format: [batch, num_boxes, 84] where 84 = 4 (bbox) + 80 (classes)
        predictions = outputs[0].squeeze(0).T  # Transpose to [num_boxes, 84]

        # Filter by confidence
        scores = np.max(predictions[:, 4:], axis=1)
        valid = scores > self.config.confidence_threshold
        predictions = predictions[valid]
        scores = scores[valid]

        if len(predictions) == 0:
            return detections

        # Get class IDs
        class_ids = np.argmax(predictions[:, 4:], axis=1)

        # Filter by class (person = 0 in COCO)
        if self.config.classes:
            class_mask = np.isin(class_ids, self.config.classes)
            predictions = predictions[class_mask]
            scores = scores[class_mask]
            class_ids = class_ids[class_mask]

        if len(predictions) == 0:
            return detections

        # Convert bbox from center-x, center-y, w, h to x1, y1, x2, y2
        boxes = predictions[:, :4]
        x1 = (boxes[:, 0] - boxes[:, 2] / 2) / scale
        y1 = (boxes[:, 1] - boxes[:, 3] / 2) / scale
        x2 = (boxes[:, 0] + boxes[:, 2] / 2) / scale
        y2 = (boxes[:, 1] + boxes[:, 3] / 2) / scale

        # Clip to image bounds
        orig_w, orig_h = original_size
        x1 = np.clip(x1, 0, orig_w)
        y1 = np.clip(y1, 0, orig_h)
        x2 = np.clip(x2, 0, orig_w)
        y2 = np.clip(y2, 0, orig_h)

        # NMS
        indices = cv2.dnn.NMSBoxes(
            np.column_stack([x1, y1, x2 - x1, y2 - y1]).astype(np.float32).tolist(),
            scores.tolist(),
            self.config.confidence_threshold,
            self.config.iou_threshold
        )

        if len(indices) > 0:
            indices = indices.flatten()
            for i in indices:
                detections.append(Detection(
                    bbox=(int(x1[i]), int(y1[i]), int(x2[i]), int(y2[i])),
                    confidence=float(scores[i]),
                    class_id=int(class_ids[i])
                ))

        return detections

    def _dummy_detections(self, original_size: Tuple[int, int]) -> List[Detection]:
        """Return dummy detections for testing without model"""
        w, h = original_size
        return [
            Detection(bbox=(w//4, h//4, w//2, h//2), confidence=0.9, class_id=0),
            Detection(bbox=(w//2, h//4, 3*w//4, h//2), confidence=0.85, class_id=0),
        ]

    def detect(self, frame: np.ndarray) -> List[Detection]:
        """Run person detection on frame"""
        if self.session is None:
            return self._dummy_detections(frame.shape[:2][::-1])

        # Preprocess
        input_tensor, scale, padded_size, original_size = self.preprocess(frame)

        # Inference
        outputs = self.session.run(self.output_names, {self.input_name: input_tensor})

        # Postprocess
        detections = self.postprocess(outputs[0], scale, padded_size, original_size)

        return detections

    def detect_in_roi(self, frame: np.ndarray, roi: List[List[int]]) -> List[Detection]:
        """Detect persons only within ROI"""
        # Create mask for ROI
        mask = np.zeros(frame.shape[:2], dtype=np.uint8)
        pts = np.array(roi, dtype=np.int32)
        cv2.fillPoly(mask, [pts], 255)

        # Apply mask
        masked_frame = cv2.bitwise_and(frame, frame, mask=mask)

        # Detect
        detections = self.detect(masked_frame)

        # Filter detections to ensure center is in ROI
        filtered = []
        for det in detections:
            x1, y1, x2, y2 = det.bbox
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            if cv2.pointPolygonTest(pts, (cx, cy), False) >= 0:
                filtered.append(det)

        return filtered