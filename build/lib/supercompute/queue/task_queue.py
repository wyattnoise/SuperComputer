from __future__ import annotations
import heapq
import time
from typing import Any, Optional
from enum import IntEnum
from dataclasses import dataclass, field


class QueuePriority(IntEnum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


@dataclass
class QueueItem:
    priority: int
    created_at: float
    id: str
    payload: dict[str, Any] = field(default_factory=dict)
    retries: int = 0
    max_retries: int = 3


class TaskQueue:
    """Priority task queue with retry support.

    Uses a min-heap with (-priority, created_at) keys so that
    higher-priority items dequeue first and FIFO within same priority.
    """

    def __init__(self, maxsize: int = 0):
        self._heap: list[tuple[int, float, str, QueueItem]] = []
        self._lookup: dict[str, QueueItem] = {}
        self._hold: dict[str, QueueItem] = {}  # dequeued items pending retry
        self.maxsize = maxsize

    @property
    def size(self) -> int:
        return len(self._heap)

    @property
    def is_empty(self) -> bool:
        return len(self._heap) == 0

    @property
    def is_full(self) -> bool:
        return self.maxsize > 0 and len(self._heap) >= self.maxsize

    def put(self, item: QueueItem) -> None:
        if self.is_full:
            raise RuntimeError(f"Queue full (maxsize={self.maxsize})")
        key = (-item.priority, item.created_at, item.id)
        heapq.heappush(self._heap, (*key, item))
        self._lookup[item.id] = item
        self._hold.pop(item.id, None)

    def get(self) -> Optional[QueueItem]:
        if self.is_empty:
            return None
        *_, item = heapq.heappop(self._heap)
        self._lookup.pop(item.id, None)
        self._hold[item.id] = item  # keep for retry
        return item

    def peek(self) -> Optional[QueueItem]:
        if self.is_empty:
            return None
        return self._heap[0][-1]

    def remove(self, item_id: str) -> bool:
        found = False
        new_heap = []
        for entry in self._heap:
            item = entry[-1]
            if item.id == item_id:
                found = True
                self._lookup.pop(item_id, None)
            else:
                new_heap.append(entry)
        if found:
            heapq.heapify(new_heap)
            self._heap = new_heap
        return found

    def get_item(self, item_id: str) -> Optional[QueueItem]:
        return self._lookup.get(item_id) or self._hold.get(item_id)

    def retry(self, item_id: str) -> bool:
        item = self.get_item(item_id)
        if not item:
            return False
        item.retries += 1
        if item.retries > item.max_retries:
            return False
        item.created_at = time.time()
        self.remove(item_id)
        self.put(item)
        return True

    def clear(self) -> None:
        self._heap.clear()
        self._lookup.clear()

    def __len__(self) -> int:
        return len(self._heap)

    def __repr__(self) -> str:
        return f"TaskQueue(size={self.size}, maxsize={self.maxsize})"

