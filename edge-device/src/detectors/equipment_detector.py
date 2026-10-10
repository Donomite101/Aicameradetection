"""
Equipment Detection using YOLOv8 custom model
"""
import cv2
import numpy as np
import onnxruntime as ort
from pathlib import Path
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class EquipmentDetection:
    bbox: Tuple[int, int, int, int]  # x1, y1, x2, y2
    confidence: float
    class_id: int
    class_name: str


class EquipmentDetector:
    # Default equipment classes (customize based on training)
    EQUIPMENT_CLASSES = {
        0: "workbench",
        1: "lathe_machine",
        2: "milling_machine",
        3: "welding_machine",
        4: "safety_helmet",
        5: "fire_extinguisher",
        6: "computer",
        7: "projector",
        8: "hand_tools",
        9: "chair",
    }

    def __init__(self, config):
        self.config = config
        self.session = None
        self.input_name = None
        self.output_names = None
        self.class_names = self.EQUIPMENT_CLASSES.copy()
        self._load_model()

    def _load_model(self):
        """Load ONNX model"""
        model_path = Path(self.config.path)
        if not model_path.exists():
            logger.warning(f"Equipment model not found at {model_path}, using dummy detector")
            self.session = None
            return

        try:
            providers = ['CPUExecutionProvider']
            self.session = ort.InferenceSession(str(model_path), providers=providers)
            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [o.name for o in self.session.get_outputs()]
            logger.info(f"Loaded equipment detection model: {model_path}")
        except Exception as e:
            logger.error(f"Failed to load equipment model: {e}")
            self.session = None

    def set_class_names(self, class_names: Dict[int, str]):
        """Update class names mapping"""
        self.class_names = class_names

    def preprocess(self, frame: np.ndarray) -> Tuple[np.ndarray, float, Tuple[int, int], Tuple[int, int]]:
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

    def postprocess(self, outputs: np.ndarray, scale: float, padded_size: Tuple[int, int], original_size: Tuple[int, int]) -> List[EquipmentDetection]:
        """Postprocess YOLO outputs"""
        detections = []

        if self.session is None:
            return self._dummy_detections(original_size)

        predictions = outputs[0].squeeze(0).T
        scores = np.max(predictions[:, 4:], axis=1)
        valid = scores > self.config.confidence_threshold
        predictions = predictions[valid]
        scores = scores[valid]

        if len(predictions) == 0:
            return detections

        class_ids = np.argmax(predictions[:, 4:], axis=1)

        if self.config.classes:
            class_mask = np.isin(class_ids, self.config.classes)
            predictions = predictions[class_mask]
            scores = scores[class_mask]
            class_ids = class_ids[class_mask]

        if len(predictions) == 0:
            return detections

        boxes = predictions[:, :4]
        x1 = (boxes[:, 0] - boxes[:, 2] / 2) / scale
        y1 = (boxes[:, 1] - boxes[:, 3] / 2) / scale
        x2 = (boxes[:, 0] + boxes[:, 2] / 2) / scale
        y2 = (boxes[:, 1] + boxes[:, 3] / 2) / scale

        orig_w, orig_h = original_size
        x1 = np.clip(x1, 0, orig_w)
        y1 = np.clip(y1, 0, orig_h)
        x2 = np.clip(x2, 0, orig_w)
        y2 = np.clip(y2, 0, orig_h)

        indices = cv2.dnn.NMSBoxes(
            np.column_stack([x1, y1, x2 - x1, y2 - y1]).astype(np.float32).tolist(),
            scores.tolist(),
            self.config.confidence_threshold,
            self.config.iou_threshold
        )

        if len(indices) > 0:
            indices = indices.flatten()
            for i in indices:
                class_id = int(class_ids[i])
                detections.append(EquipmentDetection(
                    bbox=(int(x1[i]), int(y1[i]), int(x2[i]), int(y2[i])),
                    confidence=float(scores[i]),
                    class_id=class_id,
                    class_name=self.class_names.get(class_id, f"class_{class_id}")
                ))

        return detections

    def _dummy_detections(self, original_size: Tuple[int, int]) -> List[EquipmentDetection]:
        """Return dummy detections for testing"""
        w, h = original_size
        return [
            EquipmentDetection(bbox=(w//4, h//4, w//2, h//2), confidence=0.9, class_id=0, class_name="workbench"),
            EquipmentDetection(bbox=(w//2, h//4, 3*w//4, h//2), confidence=0.85, class_id=1, class_name="lathe_machine"),
            EquipmentDetection(bbox=(w//3, h//2, 2*w//3, 3*h//4), confidence=0.8, class_id=3, class_name="welding_machine"),
        ]

    def detect(self, frame: np.ndarray) -> List[EquipmentDetection]:
        """Run equipment detection on frame"""
        if self.session is None:
            return self._dummy_detections(frame.shape[:2][::-1])

        input_tensor, scale, padded_size, original_size = self.preprocess(frame)
        outputs = self.session.run(self.output_names, {self.input_name: input_tensor})
        detections = self.postprocess(outputs[0], scale, padded_size, original_size)
        return detections

    def check_operability(self, frame: np.ndarray, detection: EquipmentDetection, person_boxes: List[Tuple[int, int, int, int]]) -> Tuple[str, float]:
        """
        Check if equipment appears operational
        Returns: (operability_status, confidence)
        """
        x1, y1, x2, y2 = detection.bbox
        equipment_center = ((x1 + x2) // 2, (y1 + y2) // 2)

        # Check if any person is near the equipment
        person_nearby = False
        min_distance = float('inf')

        for px1, py1, px2, py2 in person_boxes:
            person_center = ((px1 + px2) // 2, (py1 + py2) // 2)
            distance = np.sqrt((equipment_center[0] - person_center[0])**2 + (equipment_center[1] - person_center[1])**2)
            min_distance = min(min_distance, distance)

            # If person is within 100 pixels of equipment center
            if distance < 100:
                person_nearby = True

        # Heuristic for operability
        if detection.class_name in ["lathe_machine", "milling_machine", "welding_machine"]:
            # Machinery: operational if person nearby (someone operating it)
            if person_nearby:
                return "functional", 0.8
            else:
                return "unknown", 0.5  # Could be functional but not in use
        elif detection.class_name in ["workbench", "chair"]:
            # Furniture: check if surface is clear/cluttered (simplified)
            return "functional", 0.7
        elif detection.class_name in ["safety_helmet", "fire_extinguisher"]:
            # Safety equipment: present = functional
            return "functional", 0.9
        else:
            return "functional", 0.6