"""
Face Blurring for Privacy Protection
Uses MediaPipe Face Detection
"""
import cv2
import numpy as np
import mediapipe as mp
from typing import List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class FaceBlurrer:
    def __init__(self, config):
        self.config = config
        self.face_detection = None
        self._init_mediapipe()

    def _init_mediapipe(self):
        """Initialize MediaPipe face detection"""
        try:
            self.face_detection = mp.solutions.face_detection.FaceDetection(
                model_selection=1,  # 0 for short range, 1 for full range
                min_detection_confidence=self.config.min_detection_confidence
            )
            logger.info("MediaPipe face detection initialized")
        except Exception as e:
            logger.error(f"Failed to initialize MediaPipe: {e}")
            self.face_detection = None

    def detect_faces(self, frame: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """Detect faces in frame, return list of (x, y, w, h)"""
        if self.face_detection is None:
            return []

        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_detection.process(rgb_frame)

        faces = []
        if results.detections:
            h, w = frame.shape[:2]
            for detection in results.detections:
                bbox = detection.location_data.relative_bounding_box
                x = int(bbox.xmin * w)
                y = int(bbox.ymin * h)
                width = int(bbox.width * w)
                height = int(bbox.height * h)

                # Ensure coordinates are within frame
                x = max(0, x)
                y = max(0, y)
                width = min(width, w - x)
                height = min(height, h - y)

                if width > 0 and height > 0:
                    faces.append((x, y, width, height))

        return faces

    def blur_faces(self, frame: np.ndarray, faces: Optional[List[Tuple[int, int, int, int]]] = None) -> np.ndarray:
        """Blur detected faces in frame"""
        if faces is None:
            faces = self.detect_faces(frame)

        if not faces:
            return frame

        blurred = frame.copy()
        kernel_size = self.config.blur_kernel_size
        # Ensure kernel size is odd
        if kernel_size % 2 == 0:
            kernel_size += 1

        for (x, y, w, h) in faces:
            # Add padding around face
            padding = max(w, h) // 4
            x1 = max(0, x - padding)
            y1 = max(0, y - padding)
            x2 = min(frame.shape[1], x + w + padding)
            y2 = min(frame.shape[0], y + h + padding)

            # Apply Gaussian blur
            roi = blurred[y1:y2, x1:x2]
            if roi.size > 0:
                blurred_roi = cv2.GaussianBlur(roi, (kernel_size, kernel_size), 0)
                blurred[y1:y2, x1:x2] = blurred_roi

        return blurred

    def blur_faces_inplace(self, frame: np.ndarray, faces: Optional[List[Tuple[int, int, int, int]]] = None) -> None:
        """Blur faces in-place (modifies frame directly)"""
        if faces is None:
            faces = self.detect_faces(frame)

        if not faces:
            return

        kernel_size = self.config.blur_kernel_size
        if kernel_size % 2 == 0:
            kernel_size += 1

        for (x, y, w, h) in faces:
            padding = max(w, h) // 4
            x1 = max(0, x - padding)
            y1 = max(0, y - padding)
            x2 = min(frame.shape[1], x + w + padding)
            y2 = min(frame.shape[0], y + h + padding)

            roi = frame[y1:y2, x1:x2]
            if roi.size > 0:
                frame[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (kernel_size, kernel_size), 0)

    def anonymize_frame(self, frame: np.ndarray) -> np.ndarray:
        """Full anonymization: blur faces, return anonymized frame"""
        faces = self.detect_faces(frame)
        return self.blur_faces(frame, faces)