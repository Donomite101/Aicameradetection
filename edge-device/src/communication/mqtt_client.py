"""
MQTT Client for Edge Device Communication
"""
import asyncio
import json
import logging
from typing import Dict, Any, Optional, Callable
import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


class MQTTClient:
    def __init__(self, config):
        self.config = config
        self.client = None
        self.connected = False
        self.message_handlers: Dict[str, Callable] = {}
        self._setup_client()

    def _setup_client(self):
        """Setup MQTT client"""
        self.client = mqtt.Client(
            client_id=f"edge-{self.config.topics.heartbeat.split('/')[-1]}",
            clean_session=True
        )

        if self.config.username and self.config.password:
            self.client.username_pw_set(self.config.username, self.config.password)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.client.on_publish = self._on_publish

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.connected = True
            logger.info("MQTT connected successfully")
            # Subscribe to command topic
            cmd_topic = self.config.topics.commands.format(device_id="*")
            client.subscribe(cmd_topic, qos=self.config.qos)
        else:
            self.connected = False
            logger.error(f"MQTT connection failed with code {rc}")

    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        if rc != 0:
            logger.warning(f"MQTT disconnected unexpectedly: {rc}")
        else:
            logger.info("MQTT disconnected")

    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            logger.debug(f"MQTT received: {topic} -> {payload}")

            # Handle commands
            if topic in self.message_handlers:
                self.message_handlers[topic](payload)
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")

    def _on_publish(self, client, userdata, mid):
        logger.debug(f"MQTT message published: {mid}")

    async def connect(self):
        """Connect to MQTT broker"""
        try:
            # Parse broker URL
            broker_url = self.config.broker
            if broker_url.startswith("mqtt://"):
                broker_url = broker_url[6:]
            elif broker_url.startswith("mqtts://"):
                broker_url = broker_url[8:]

            host, port = broker_url.split(":") if ":" in broker_url else (broker_url, 1883)
            port = int(port)

            self.client.connect_async(host, port, keepalive=self.config.keepalive)
            self.client.loop_start()

            # Wait for connection
            for _ in range(50):  # 5 second timeout
                if self.connected:
                    break
                await asyncio.sleep(0.1)

            if not self.connected:
                raise ConnectionError("MQTT connection timeout")

        except Exception as e:
            logger.error(f"MQTT connect error: {e}")
            raise

    async def disconnect(self):
        """Disconnect from MQTT broker"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.connected = False
            logger.info("MQTT disconnected")

    async def publish(self, topic: str, payload: Dict[str, Any], qos: int = None, retain: bool = False):
        """Publish message to topic"""
        if not self.connected:
            logger.warning("MQTT not connected, cannot publish")
            return False

        try:
            qos = qos or self.config.qos
            payload_str = json.dumps(payload, default=str)
            result = self.client.publish(topic, payload_str, qos=qos, retain=retain)
            result.wait_for_publish(timeout=5)
            return True
        except Exception as e:
            logger.error(f"MQTT publish error: {e}")
            return False

    def subscribe(self, topic: str, handler: Callable):
        """Subscribe to topic with handler"""
        self.message_handlers[topic] = handler
        if self.connected:
            self.client.subscribe(topic, qos=self.config.qos)

    def is_connected(self) -> bool:
        return self.connected