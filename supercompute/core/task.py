from __future__ import annotations
import uuid
import time
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class TaskPriority(int, Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


class Task(BaseModel):
    id: str = Field(default_factory=lambda: f"task-{uuid.uuid4().hex[:8]}")
    name: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    node_id: Optional[str] = None
    created_at: float = Field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    retries: int = 0
    max_retries: int = 3
    error: Optional[str] = None
    result: Optional[Any] = None
    tags: list[str] = Field(default_factory=list)

    @property
    def duration(self) -> Optional[float]:
        if self.started_at and self.completed_at:
            return self.completed_at - self.started_at
        return None

    @property
    def age(self) -> float:
        return time.time() - self.created_at

    def can_retry(self) -> bool:
        return self.retries < self.max_retries

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


