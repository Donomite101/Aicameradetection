"""
Configuration loader for edge device
"""
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
import yaml


class CameraConfig(BaseModel):
    id: str
    name: str
    rtsp_url: str
    roi: Optional[List[List[int]]] = None
    enabled: bool = True
    fps: int = 15
    inference_interval: int = 2


class ModelConfig(BaseModel):
    path: str
    confidence_threshold: float = 0.5
    iou_threshold: float = 0.45
    classes: List[int] = Field(default_factory=list)
    input_size: List[int] = [640, 640]


class PoseModelConfig(BaseModel):
    path: str
    confidence_threshold: float = 0.5
    input_size: List[int] = [640, 640]


class FaceDetectionConfig(BaseModel):
    model: str = "mediapipe"
    min_detection_confidence: float = 0.5


class ModelsConfig(BaseModel):
    person_detection: ModelConfig
    pose_estimation: PoseModelConfig
    equipment_detection: ModelConfig
    face_detection: FaceDetectionConfig


class PrivacyConfig(BaseModel):
    enable_face_blur: bool = True
    blur_kernel_size: int = 51
    store_raw_frames: bool = False
    store_blurred_thumbnails: bool = True
    thumbnail_quality: int = 80


class DetectionConfig(BaseModel):
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


class MQTTConfig(BaseModel):
    broker: str
    username: str = ""
    password: str = ""
    topics:
        attendance: str
        infrastructure: str
        alerts: str
        heartbeat: str
        commands: str
    qos: int = 1
    keepalive: int = 60


class HTTPConfig(BaseModel):
    endpoint: str
    timeout: int = 30
    retry_attempts: int = 3
    retry_delay: int = 5


class CommunicationConfig(BaseModel):
    mode: str = "mqtt"
    mqtt: MQTTConfig
    http: HTTPConfig


class LowBandwidthConfig(BaseModel):
    enabled: bool = False
    metadata_only: bool = False
    frame_skip: int = 2
    compress_thumbnails: bool = True
    thumbnail_max_size: int = 100


class BufferConfig(BaseModel):
    enabled: bool = True
    max_events: int = 1000
    max_size_mb: int = 100
    flush_interval: int = 60
    persist_to_disk: bool = True
    storage_path: str = "data/buffer"


class LoggingConfig(BaseModel):
    level: str = "INFO"
    format: str = "json"
    file: str = "logs/edge-device.log"
    rotation: str = "1 day"
    retention: str = "7 days"


class SystemConfig(BaseModel):
    heartbeat_interval: int = 30
    health_check_interval: int = 60
    auto_restart_on_error: bool = True
    max_consecutive_errors: int = 5


class DeviceConfig(BaseModel):
    id: str
    centre_id: str
    name: str


class EdgeConfig(BaseModel):
    device: DeviceConfig
    cameras: List[CameraConfig]
    models: ModelsConfig
    privacy: PrivacyConfig
    detection: DetectionConfig
    communication: CommunicationConfig
    low_bandwidth: LowBandwidthConfig
    buffer: BufferConfig
    logging: LoggingConfig
    system: SystemConfig


def load_config(config_path: str) -> EdgeConfig:
    """Load configuration from YAML file"""
    path = Path(config_path)
    if not path.exists():
        # Try relative to this file
        path = Path(__file__).parent.parent / config_path

    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(path, 'r') as f:
        data = yaml.safe_load(f)

    return EdgeConfig(**data)


# For backwards compatibility
def get_config(config_path: str = "config.yaml") -> EdgeConfig:
    return load_config(config_path)