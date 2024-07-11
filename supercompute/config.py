from __future__ import annotations
import os
import yaml
from typing import Any, Optional
from pydantic import BaseModel, Field


class RetryConfig(BaseModel):
    max_retries: int = 3
    retry_delay: float = 1.0


class ClusterConfig(BaseModel):
    nodes: int = 5
    strategy: str = "score_based"
    heartbeat_interval: int = 5
    scheduler_interval: float = 0.5
    retry: RetryConfig = Field(default_factory=RetryConfig)


class LoggingConfig(BaseModel):
    level: str = "INFO"
    format: str = "json"
    output_file: Optional[str] = None


class ApiConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8080
    enabled: bool = True


class ObservabilityConfig(BaseModel):
    metrics_enabled: bool = True
    metrics_interval: int = 10


class QueueConfig(BaseModel):
    maxsize: int = 0
    default_priority: int = 1


class Config(BaseModel):
    cluster: ClusterConfig = Field(default_factory=ClusterConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    api: ApiConfig = Field(default_factory=ApiConfig)
    observability: ObservabilityConfig = Field(default_factory=ObservabilityConfig)
    queue: QueueConfig = Field(default_factory=QueueConfig)


_SEARCH_PATHS = [
    "config/config.yaml",
    "config/default.yaml",
    "~/.supercompute/config.yaml",
]


def load_config(path: Optional[str] = None) -> Config:
    """Load config from YAML file. Falls back to search paths, then defaults."""
    candidates = [path] if path else _SEARCH_PATHS
    for p in candidates:
        if p:
            expanded = os.path.expanduser(p)
            if os.path.exists(expanded):
                with open(expanded) as f:
                    data = yaml.safe_load(f) or {}
                return Config(**data)
    return Config()


