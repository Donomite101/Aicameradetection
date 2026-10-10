"""
Logger setup for edge device
"""
import sys
from pathlib import Path
from loguru import logger as loguru_logger


def setup_logger(name: str = "edge-device", config=None):
    """Setup logger with configuration"""
    # Remove default handler
    loguru_logger.remove()

    # Console handler
    loguru_logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level="INFO",
        colorize=True
    )

    # File handler if config provided
    if config and hasattr(config, 'logging'):
        log_path = Path(config.logging.file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        loguru_logger.add(
            str(log_path),
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
            level=config.logging.level,
            rotation=config.logging.rotation,
            retention=config.logging.retention,
            compression="zip",
            serialize=config.logging.format == "json"
        )

    return loguru_logger.bind(name=name)


def get_logger(name: str = "edge-device"):
    """Get logger instance"""
    return loguru_logger.bind(name=name)