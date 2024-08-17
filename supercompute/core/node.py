from __future__ import annotations
import time
import uuid
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class NodeStatus(str, Enum):
    OFFLINE = "offline"
    IDLE = "idle"
    BUSY = "busy"
    DRAINING = "draining"
    DEAD = "dead"


class NodeSpec(BaseModel):
    cpu_cores: int = 4
    memory_gb: float = 8.0
    gpu_available: bool = False
    gpu_memory_gb: Optional[float] = None
    region: str = "default"
    tags: list[str] = Field(default_factory=list)


class Node(BaseModel):
    id: str = Field(default_factory=lambda: f"node-{uuid.uuid4().hex[:4]}")
    host: str = "127.0.0.1"
    port: int = 0
    status: NodeStatus = NodeStatus.OFFLINE
    spec: NodeSpec = Field(default_factory=NodeSpec)
    current_load: float = 0.0  # 0.0 - 1.0
    queue_length: int = 0
    last_heartbeat: float = Field(default_factory=time.time)
    started_at: float = Field(default_factory=time.time)
    tasks_completed: int = 0
    tasks_failed: int = 0
    avg_task_time: float = 0.0

    @property
    def is_alive(self) -> bool:
        return (time.time() - self.last_heartbeat) < 30.0

    @property
    def score(self) -> float:
        """Adaptive scheduling score: lower = better candidate"""
        load_factor = self.current_load * 0.5
        queue_factor = min(self.queue_length / 10, 1.0) * 0.3
        failure_penalty = 0.0
        total = self.tasks_completed + self.tasks_failed
        if total > 0:
            failure_rate = self.tasks_failed / total
            failure_penalty = failure_rate * 0.2
        return load_factor + queue_factor + failure_penalty

    def heartbeat(self) -> None:
        self.last_heartbeat = time.time()

    def assign_task(self) -> None:
        self.status = NodeStatus.BUSY
        self.current_load = min(self.current_load + 0.2, 1.0)
        self.queue_length = max(self.queue_length - 1, 0)

    def complete_task(self, task_time: float = 0.0) -> None:
        self.tasks_completed += 1
        self.current_load = max(self.current_load - 0.1, 0.0)
        if task_time > 0:
            self.avg_task_time = (self.avg_task_time * (self.tasks_completed - 1) + task_time) / self.tasks_completed

    def fail_task(self) -> None:
        self.tasks_failed += 1
        self.current_load = max(self.current_load - 0.1, 0.0)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()



