from __future__ import annotations
import json
import logging
import sys
from typing import Optional


class JSONFormatter(logging.Formatter):
    """Structured JSON logging for production observability."""

    def format(self, record: logging.LogRecord) -> str:
        base = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "name": record.name,
            "message": record.msg,
        }
        if hasattr(record, "task_id"):
            base["task_id"] = record.task_id
        if hasattr(record, "node_id"):
            base["node_id"] = record.node_id
        if record.exc_info and record.exc_info[0]:
            base["exception"] = self.formatException(record.exc_info)
        return json.dumps(base)


def setup_logging(
    level: str = "INFO",
    fmt: str = "json",
    output_file: Optional[str] = None,
) -> None:
    """Configure root logger with structured output.

    Args:
        level: One of DEBUG, INFO, WARNING, ERROR, CRITICAL
        fmt: "json" for structured, "text" for human-readable
        output_file: Optional path to log file (appended)
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.handlers.clear()

    if fmt == "json":
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
        )

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root.addHandler(console)

    if output_file:
        fh = logging.FileHandler(output_file)
        fh.setFormatter(formatter)
        root.addHandler(fh)

    # Suppress noisy third-party loggers
    for name in ("httpx", "urllib3", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)


# Convenience: structured log helper
def log_event(logger: logging.Logger, event: str, **kwargs) -> None:
    """Log a structured event as JSON."""
    extra = {"event": event, **kwargs}
    logger.info(extra)



