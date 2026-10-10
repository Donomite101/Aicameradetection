"""
Video Processing Pipeline for Edge Device
"""
import asyncio
import cv2
import numpy as np
import time
import uuid
import base64
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class CameraStatus:
    camera_id: str
    status: str  # "connected", "disconnected", "error"
    fps: float
    last_frame_time: float
    frames_processed: int
    errors: int


@dataclass
class CameraConfig:
    id: str
    name: str
    rtsp_url: str
    roi: Optional[List[List[int]]] = None
    enabled: bool = True
    fps: int = 15
    inference_interval: int = 2


@dataclass
class DetectionConfig:
    attendance:
        enabled: bool = True
        interval_seconds: int = 300
        discrepancy_threshold: int = 2
        min_persons_for_alert: int = 1
    infrastructure:
        enabled: bool = True
        interval_seconds: int = 300
        check_operability: bool = True
        operability_confidence: float = 0.6


@dataclass
class PrivacyConfig:
    enable_face_blur: bool = True
    blur_kernel_size: int = 51
    store_raw_frames: bool = False
    store_blurred_thumbnails: bool = True
    thumbnail_quality: int = 80


@dataclass
class LowBandwidthConfig:
    enabled: bool = False
    metadata_only: bool = False
    frame_skip: int = 2
    compress_thumbnails: bool = True
    thumbnail_max_size: int = 100


@dataclass
class BufferConfig:
    enabled: bool = True
    max_events: int = 1000
    max_size_mb: int = 100
    flush_interval: int = 60
    persist_to_disk: bool = True
    storage_path: str = "data/buffer"


class VideoProcessor:
    def __init__(
        self,
        camera_config: CameraConfig,
        detectors: Dict[str, Any],
        communication: Dict[str, Any],
        privacy_config: PrivacyConfig,
        detection_config: DetectionConfig,
        low_bandwidth_config: LowBandwidthConfig,
        buffer_config: BufferConfig,
    ):
        self.camera_config = camera_config
        self.detectors = detectors
        self.communication = communication
        self.privacy_config = privacy_config
        self.detection_config = detection_config
        self.low_bandwidth_config = low_bandwidth_config
        self.buffer_config = buffer_config

        self.cap = None
        self.running = False
        self.frame_count = 0
        self.last_attendance_check = 0
        self.last_infrastructure_check = 0
        self.status = CameraStatus(
            camera_id=camera_config.id,
            status="disconnected",
            fps=0.0,
            last_frame_time=0,
            frames_processed=0,
            errors=0
        )

        # Event buffer for offline operation
        self.event_buffer: List[Dict[str, Any]] = []
        self.buffer_size = 0

        # ROI mask
        self.roi_mask = None
        if camera_config.roi:
            self._create_roi_mask()

    def _create_roi_mask(self):
        """Create ROI mask for camera"""
        # Will be created when first frame is received
        pass

    def get_status(self) -> Dict[str, Any]:
        return {
            "camera_id": self.status.camera_id,
            "status": self.status.status,
            "fps": round(self.status.fps, 1),
            "frames_processed": self.status.frames_processed,
            "errors": self.status.errors,
            "buffer_size": len(self.event_buffer),
        }

    async def run(self):
        """Main processing loop"""
        self.running = True
        logger.info(f"Starting video processor for camera {self.camera_config.id}")

        # Connect to camera
        await self._connect_camera()

        if not self.cap or not self.cap.isOpened():
            self.status.status = "error"
            logger.error(f"Failed to open camera {self.camera_config.id}")
            return

        self.status.status = "connected"
        last_fps_time = time.time()
        frames_since_fps = 0

        try:
            while self.running:
                # Read frame
                ret, frame = self.cap.read()
                if not ret:
                    logger.warning(f"Camera {self.camera_config.id}: Failed to read frame")
                    self.status.errors += 1
                    await asyncio.sleep(1)
                    await self._reconnect_camera()
                    continue

                self.frame_count += 1
                frames_since_fps += 1
                self.status.last_frame_time = time.time()
                self.status.frames_processed += 1

                # Update FPS
                if time.time() - last_fps_time >= 1.0:
                    self.status.fps = frames_since_fps
                    frames_since_fps = 0
                    last_fps_time = time.time()

                # Process frame based on inference interval
                if self.frame_count % self.camera_config.inference_interval == 0:
                    await self._process_frame(frame)

                # Flush buffer periodically
                if self.buffer_config.enabled and len(self.event_buffer) > 0:
                    await self._flush_buffer()

                # Small delay to prevent CPU overload
                await asyncio.sleep(0.01)

        except Exception as e:
            logger.exception(f"Error in video processor {self.camera_config.id}: {e}")
            self.status.status = "error"
        finally:
            await self.stop()

    async def _connect_camera(self):
        """Connect to RTSP camera"""
        try:
            # Set RTSP transport to TCP for better reliability
            os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp'
            self.cap = cv2.VideoCapture(self.camera_config.rtsp_url, cv2.CAP_FFMPEG)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Wait for first frame
            for _ in range(10):
                ret, _ = self.cap.read()
                if ret:
                    break
                await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(f"Camera connection error: {e}")
            self.cap = None

    async def _reconnect_camera(self):
        """Attempt to reconnect camera"""
        if self.cap:
            self.cap.release()

        logger.info(f"Reconnecting camera {self.camera_config.id}...")
        self.status.status = "disconnected"
        await asyncio.sleep(5)
        await self._connect_camera()

        if self.cap and self.cap.isOpened():
            self.status.status = "connected"
            logger.info(f"Camera {self.camera_config.id} reconnected")
        else:
            self.status.status = "error"

    async def _process_frame(self, frame: np.ndarray):
        """Process single frame for detection"""
        try:
            # Apply ROI mask
            if self.camera_config.roi and self.roi_mask is not None:
                if self.roi_mask.shape[:2] != frame.shape[:2]:
                    self._create_roi_mask(frame.shape[:2])
                frame = cv2.bitwise_and(frame, frame, mask=self.roi_mask)

            # Privacy: Blur faces
            if self.privacy_config.enable_face_blur:
                self.detectors['face_blur'].blur_faces_inplace(frame)

            # Person Detection (Attendance)
            if self.detection_config.attendance.enabled:
                await self._process_attendance(frame)

            # Infrastructure Detection
            if self.detection_config.infrastructure.enabled:
                await self._process_infrastructure(frame)

        except Exception as e:
            logger.error(f"Frame processing error: {e}")
            self.status.errors += 1

    async def _process_attendance(self, frame: np.ndarray):
        """Process attendance detection"""
        current_time = time.time()
        if current_time - self.last_attendance_check < self.detection_config.attendance.interval_seconds:
            return

        self.last_attendance_check = current_time

        # Detect persons
        person_detections = self.detectors['person'].detect_in_roi(frame, self.camera_config.roi or [])
        person_count = len(person_detections)

        # Get person bounding boxes for pose estimation
        person_boxes = [det.bbox for det in person_detections]

        # Pose estimation for activity detection
        poses = self.detectors['pose'].estimate_in_roi(frame, self.camera_config.roi or [], person_boxes)
        sitting_count = sum(1 for p in poses if self.detectors['pose'].get_activity_state(p) == "sitting")

        # Create event
        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": "attendance",
            "centre_id": self.camera_config.id.split('-')[0] if '-' in self.camera_config.id else "unknown",
            "camera_id": self.camera_config.id,
            "timestamp": current_time,
            "data": {
                "person_count": person_count,
                "sitting_count": sitting_count,
                "standing_count": person_count - sitting_count,
                "detections": [
                    {
                        "bbox": det.bbox,
                        "confidence": det.confidence,
                        "class_id": det.class_id
                    }
                    for det in person_detections
                ],
                "poses": [
                    {
                        "bbox": pose.bbox,
                        "activity": self.detectors['pose'].get_activity_state(pose),
                        "confidence": pose.confidence
                    }
                    for pose in poses
                ]
            }
        }

        await self._send_event(event)

    async def _process_infrastructure(self, frame: np.ndarray):
        """Process infrastructure detection"""
        current_time = time.time()
        if current_time - self.last_infrastructure_check < self.detection_config.infrastructure.interval_seconds:
            return

        self.last_infrastructure_check = current_time

        # Get person boxes for operability checking
        person_detections = self.detectors['person'].detect_in_roi(frame, self.camera_config.roi or [])
        person_boxes = [det.bbox for det in person_detections]

        # Detect equipment
        equipment_detections = self.detectors['equipment'].detect(frame)

        for equip_det in equipment_detections:
            # Check operability
            operability, operability_conf = self.detectors['equipment'].check_operability(
                frame, equip_det, person_boxes
            )

            # Create event
            event = {
                "event_id": str(uuid.uuid4()),
                "event_type": "infrastructure",
                "centre_id": self.camera_config.id.split('-')[0] if '-' in self.camera_config.id else "unknown",
                "camera_id": self.camera_config.id,
                "timestamp": current_time,
                "data": {
                    "item_class": equip_det.class_name,
                    "item_class_id": equip_det.class_id,
                    "bbox": equip_det.bbox,
                    "confidence": equip_det.confidence,
                    "operability": operability,
                    "operability_confidence": operability_conf,
                    "person_nearby": any(
                        self._boxes_overlap(equip_det.bbox, pbox, threshold=100)
                        for pbox in person_boxes
                    )
                }
            }

            # Generate thumbnail if enabled
            if self.privacy_config.store_blurred_thumbnails:
                thumb = self._create_thumbnail(frame, equip_det.bbox)
                if thumb:
                    event["data"]["thumbnail"] = thumb

            await self._send_event(event)

    def _boxes_overlap(self, box1: Tuple[int, int, int, int], box2: Tuple[int, int, int, int], threshold: int = 50) -> bool:
        """Check if two boxes are within threshold distance"""
        x1, y1, x2, y2 = box1
        cx1, cy1 = (x1 + x2) // 2, (y1 + y2) // 2
        x3, y3, x4, y4 = box2
        cx2, cy2 = (x3 + x4) // 2, (y3 + y4) // 2
        distance = np.sqrt((cx1 - cx2)**2 + (cy1 - cy2)**2)
        return distance < threshold

    def _create_thumbnail(self, frame: np.ndarray, bbox: Tuple[int, int, int, int]) -> Optional[str]:
        """Create base64 encoded thumbnail with annotation"""
        try:
            x1, y1, x2, y2 = bbox
            # Add padding
            padding = 20
            h, w = frame.shape[:2]
            x1 = max(0, x1 - padding)
            y1 = max(0, y1 - padding)
            x2 = min(w, x2 + padding)
            y2 = min(h, y2 + padding)

            thumb = frame[y1:y2, x1:x2].copy()

            # Draw bbox on thumbnail
            rel_x1, rel_y1 = 0, 0
            rel_x2, rel_y2 = x2 - x1, y2 - y1
            cv2.rectangle(thumb, (rel_x1, rel_y1), (rel_x2, rel_y2), (0, 255, 0), 2)

            # Encode
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, self.privacy_config.thumbnail_quality]
            _, buffer = cv2.imencode('.jpg', thumb, encode_params)

            # Check size limit
            if len(buffer) > self.low_bandwidth_config.thumbnail_max_size * 1024:
                # Reduce quality
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, 50]
                _, buffer = cv2.imencode('.jpg', thumb, encode_params)

            return base64.b64encode(buffer).decode('utf-8')

        except Exception as e:
            logger.error(f"Thumbnail creation error: {e}")
            return None

    async def _send_event(self, event: Dict[str, Any]):
        """Send event via available communication channels"""
        # Add to buffer
        if self.buffer_config.enabled:
            self.event_buffer.append(event)
            self.buffer_size += len(str(event).encode())

            # Flush if buffer full
            if len(self.event_buffer) >= self.buffer_config.max_events or \
               self.buffer_size >= self.buffer_config.max_size_mb * 1024 * 1024:
                await self._flush_buffer()

        # Try immediate send
        if 'mqtt' in self.communication and self.communication['mqtt'].is_connected():
            await self._send_mqtt(event)
        elif 'http' in self.communication:
            await self._send_http(event)

    async def _send_mqtt(self, event: Dict[str, Any]):
        """Send event via MQTT"""
        try:
            mqtt_client = self.communication['mqtt']
            event_type = event["event_type"]

            if event_type == "attendance":
                topic = mqtt_client.config.topics.attendance.format(
                    centre_id=event["centre_id"],
                    camera_id=event["camera_id"]
                )
            elif event_type == "infrastructure":
                topic = mqtt_client.config.topics.infrastructure.format(
                    centre_id=event["centre_id"],
                    camera_id=event["camera_id"]
                )
            else:
                topic = mqtt_client.config.topics.alerts.format(centre_id=event["centre_id"])

            await mqtt_client.publish(topic, event)
        except Exception as e:
            logger.error(f"MQTT send error: {e}")

    async def _send_http(self, event: Dict[str, Any]):
        """Send event via HTTP"""
        try:
            http_client = self.communication['http']
            event_type = event["event_type"]

            if event_type == "attendance":
                await http_client.send_attendance_event(
                    event["centre_id"], event["camera_id"], event["data"]
                )
            elif event_type == "infrastructure":
                item_class = event["data"].get("item_class", "unknown")
                await http_client.send_infrastructure_event(
                    event["centre_id"], event["camera_id"], item_class, event["data"]
                )
        except Exception as e:
            logger.error(f"HTTP send error: {e}")

    async def _flush_buffer(self):
        """Flush event buffer"""
        if not self.event_buffer:
            return

        events_to_send = self.event_buffer.copy()
        self.event_buffer.clear()
        self.buffer_size = 0

        # Try batch upload via HTTP
        if 'http' in self.communication and events_to_send:
            centre_id = events_to_send[0].get("centre_id", "unknown")
            success = await self.communication['http'].batch_upload(centre_id, events_to_send)

            if not success:
                # Put back in buffer
                self.event_buffer = events_to_send + self.event_buffer
                self.buffer_size = sum(len(str(e).encode()) for e in self.event_buffer)

    async def stop(self):
        """Stop video processor"""
        self.running = False
        if self.cap:
            self.cap.release()
            self.cap = None
        await self._flush_buffer()
        logger.info(f"Video processor {self.camera_config.id} stopped")