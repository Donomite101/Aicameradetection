#!/usr/bin/env python3
"""
Edge Device Main Entry Point
SIH26245 - AI-Based Real-Time Monitoring of Training Centres
"""

import asyncio
import signal
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.config import load_config
from src.detectors.person_detector import PersonDetector
from src.detectors.pose_estimator import PoseEstimator
from src.detectors.equipment_detector import EquipmentDetector
from src.privacy.face_blur import FaceBlurrer
from src.communication.mqtt_client import MQTTClient
from src.communication.http_client import HTTPClient
from src.pipeline.video_processor import VideoProcessor
from src.utils.logger import setup_logger
from src.utils.health import HealthChecker

logger = setup_logger(__name__)


class EdgeDevice:
    def __init__(self, config_path: str = "config.yaml"):
        self.config = load_config(config_path)
        self.running = False
        self.detectors = {}
        self.communication = {}
        self.processors = {}
        self.health_checker = HealthChecker(self.config)

    async def initialize(self):
        """Initialize all components"""
        logger.info("Initializing edge device...")

        # Initialize detectors
        self.detectors['person'] = PersonDetector(self.config.models.person_detection)
        self.detectors['pose'] = PoseEstimator(self.config.models.pose_estimation)
        self.detectors['equipment'] = EquipmentDetector(self.config.models.equipment_detection)
        self.detectors['face_blur'] = FaceBlurrer(self.config.models.face_detection)

        # Initialize communication
        if self.config.communication.mode in ['mqtt', 'both']:
            self.communication['mqtt'] = MQTTClient(self.config.communication.mqtt)
            await self.communication['mqtt'].connect()

        if self.config.communication.mode in ['http', 'both']:
            self.communication['http'] = HTTPClient(self.config.communication.http)

        # Initialize video processors for each camera
        for cam_config in self.config.cameras:
            if cam_config.enabled:
                processor = VideoProcessor(
                    camera_config=cam_config,
                    detectors=self.detectors,
                    communication=self.communication,
                    privacy_config=self.config.privacy,
                    detection_config=self.config.detection,
                    low_bandwidth_config=self.config.low_bandwidth,
                    buffer_config=self.config.buffer,
                )
                self.processors[cam_config.id] = processor

        logger.info(f"Initialized {len(self.processors)} camera processors")

    async def start(self):
        """Start all processors"""
        logger.info("Starting edge device...")
        self.running = True

        # Start all camera processors
        tasks = []
        for cam_id, processor in self.processors.items():
            task = asyncio.create_task(processor.run())
            tasks.append(task)

        # Start health checker
        health_task = asyncio.create_task(self.health_checker.run())

        # Start heartbeat
        heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        try:
            await asyncio.gather(*tasks, health_task, heartbeat_task)
        except asyncio.CancelledError:
            logger.info("Tasks cancelled")
        except Exception as e:
            logger.exception(f"Error in main loop: {e}")
            raise

    async def stop(self):
        """Stop all components gracefully"""
        logger.info("Stopping edge device...")
        self.running = False

        # Stop processors
        for processor in self.processors.values():
            await processor.stop()

        # Stop communication
        for comm in self.communication.values():
            if hasattr(comm, 'disconnect'):
                await comm.disconnect()

        logger.info("Edge device stopped")

    async def _heartbeat_loop(self):
        """Send periodic heartbeat"""
        while self.running:
            try:
                heartbeat_data = {
                    'device_id': self.config.device.id,
                    'centre_id': self.config.device.centre_id,
                    'timestamp': asyncio.get_event_loop().time(),
                    'status': 'healthy',
                    'cameras': {cam_id: proc.get_status() for cam_id, proc in self.processors.items()},
                }

                if 'mqtt' in self.communication:
                    await self.communication['mqtt'].publish(
                        self.config.communication.mqtt.topics.heartbeat.format(
                            device_id=self.config.device.id
                        ),
                        heartbeat_data
                    )

                await asyncio.sleep(self.config.system.heartbeat_interval)
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")
                await asyncio.sleep(5)


async def main():
    config_path = sys.argv[1] if len(sys.argv) > 1 else "config.yaml"

    device = EdgeDevice(config_path)

    # Setup signal handlers
    loop = asyncio.get_event_loop()

    def signal_handler():
        logger.info("Received shutdown signal")
        asyncio.create_task(device.stop())

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    try:
        await device.initialize()
        await device.start()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        sys.exit(1)
    finally:
        await device.stop()


if __name__ == "__main__":
    asyncio.run(main())