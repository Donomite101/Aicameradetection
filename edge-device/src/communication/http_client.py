"""
HTTP Client for Edge Device Communication (fallback/alternative to MQTT)
"""
import asyncio
import json
import logging
from typing import Dict, Any, Optional
import aiohttp

logger = logging.getLogger(__name__)


class HTTPClient:
    def __init__(self, config):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.base_url = config.endpoint.rstrip('/')

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=self.config.timeout)
            self.session = aiohttp.ClientSession(timeout=timeout)
        return self.session

    async def close(self):
        """Close HTTP session"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None

    async def _request(self, method: str, endpoint: str, data: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
        """Make HTTP request with retry logic"""
        session = await self._get_session()
        url = f"{self.base_url}{endpoint}"

        for attempt in range(self.config.retry_attempts):
            try:
                if method.upper() == 'GET':
                    async with session.get(url) as response:
                        if response.status == 200:
                            return await response.json()
                        else:
                            logger.warning(f"HTTP {response.status}: {await response.text()}")
                elif method.upper() == 'POST':
                    async with session.post(url, json=data) as response:
                        if response.status in (200, 201):
                            return await response.json()
                        else:
                            logger.warning(f"HTTP {response.status}: {await response.text()}")
                elif method.upper() == 'PATCH':
                    async with session.patch(url, json=data) as response:
                        if response.status == 200:
                            return await response.json()
                        else:
                            logger.warning(f"HTTP {response.status}: {await response.text()}")

            except asyncio.TimeoutError:
                logger.warning(f"HTTP request timeout (attempt {attempt + 1}/{self.config.retry_attempts})")
            except Exception as e:
                logger.error(f"HTTP request error: {e}")

            if attempt < self.config.retry_attempts - 1:
                await asyncio.sleep(self.config.retry_delay)

        return None

    # Attendance API
    async def send_attendance_event(self, centre_id: str, camera_id: str, data: Dict[str, Any]) -> bool:
        """Send attendance detection event"""
        endpoint = f"/edge/attendance/{centre_id}/{camera_id}"
        result = await self._request('POST', endpoint, data)
        return result is not None

    # Infrastructure API
    async def send_infrastructure_event(self, centre_id: str, camera_id: str, item_id: str, data: Dict[str, Any]) -> bool:
        """Send infrastructure check event"""
        endpoint = f"/edge/infrastructure/{centre_id}/{camera_id}/{item_id}"
        result = await self._request('POST', endpoint, data)
        return result is not None

    # Alert API
    async def send_alert(self, centre_id: str, data: Dict[str, Any]) -> bool:
        """Send alert"""
        endpoint = f"/edge/alerts/{centre_id}"
        result = await self._request('POST', endpoint, data)
        return result is not None

    # Heartbeat
    async def send_heartbeat(self, device_id: str, data: Dict[str, Any]) -> bool:
        """Send heartbeat"""
        endpoint = f"/edge/heartbeat/{device_id}"
        result = await self._request('POST', endpoint, data)
        return result is not None

    # Batch upload for low bandwidth mode
    async def batch_upload(self, centre_id: str, events: list) -> bool:
        """Upload multiple events in batch"""
        endpoint = f"/edge/batch/{centre_id}"
        result = await self._request('POST', endpoint, {"events": events})
        return result is not None

    # Get configuration updates
    async def get_config(self, device_id: str) -> Optional[Dict[str, Any]]:
        """Get device configuration from server"""
        endpoint = f"/edge/config/{device_id}"
        return await self._request('GET', endpoint)

    # Upload thumbnail
    async def upload_thumbnail(self, centre_id: str, camera_id: str, image_data: bytes, filename: str) -> Optional[str]:
        """Upload thumbnail image"""
        session = await self._get_session()
        url = f"{self.base_url}/edge/upload/thumbnail/{centre_id}/{camera_id}"

        try:
            data = aiohttp.FormData()
            data.add_field('file', image_data, filename=filename, content_type='image/jpeg')

            async with session.post(url, data=data) as response:
                if response.status == 200:
                    result = await response.json()
                    return result.get('url')
        except Exception as e:
            logger.error(f"Thumbnail upload error: {e}")

        return None