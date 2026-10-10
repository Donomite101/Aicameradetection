"""
Health Checker for Edge Device
"""
import asyncio
import logging
import psutil
import time
from typing import Dict, Any

logger = logging.getLogger(__name__)


class HealthChecker:
    def __init__(self, config):
        self.config = config
        self.running = False
        self.last_check = 0
        self.checks = {}

    async def run(self):
        """Run health checks periodically"""
        self.running = True
        logger.info("Health checker started")

        while self.running:
            try:
                await self._perform_checks()
            except Exception as e:
                logger.error(f"Health check error: {e}")

            await asyncio.sleep(self.config.system.health_check_interval)

    async def _perform_checks(self):
        """Perform all health checks"""
        self.last_check = time.time()

        # System resources
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')

        # Network connectivity (basic)
        network_ok = await self._check_network()

        # Camera status (will be updated by processors)
        cameras_ok = True  # Placeholder

        # Overall health
        healthy = (
            cpu_percent < 90 and
            memory.percent < 90 and
            disk.percent < 90 and
            network_ok
        )

        self.checks = {
            "timestamp": self.last_check,
            "healthy": healthy,
            "cpu_percent": cpu_percent,
            "memory_percent": memory.percent,
            "memory_available_gb": round(memory.available / (1024**3), 2),
            "disk_percent": disk.percent,
            "disk_free_gb": round(disk.free / (1024**3), 2),
            "network_ok": network_ok,
            "cameras_ok": cameras_ok,
        }

        # Log warnings
        if not healthy:
            logger.warning(f"Health check failed: {self.checks}")

    async def _check_network(self) -> bool:
        """Basic network connectivity check"""
        try:
            import socket
            socket.create_connection(("8.8.8.8", 53), timeout=3)
            return True
        except Exception:
            return False

    def get_health(self) -> Dict[str, Any]:
        """Get latest health status"""
        return self.checks.copy()

    def stop(self):
        """Stop health checker"""
        self.running = False