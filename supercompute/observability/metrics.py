from __future__ import annotations
import time
from typing import Optional


class MetricsCollector:
    """Simple in-process metrics collector for throughput and latency.

    Tracks:
    - tasks_submitted / completed / failed / retried
    - throughput (tasks/sec)
    - average and P99 latency
    - per-node counters
    """

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.tasks_submitted = 0
        self.tasks_completed = 0
        self.tasks_failed = 0
        self.tasks_retried = 0
        self._latencies: list[float] = []
        self._start_time = time.time()
        self._node_completed: dict[str, int] = {}
        self._node_failed: dict[str, int] = {}

    def record_submit(self) -> None:
        self.tasks_submitted += 1

    def record_complete(self, latency_ms: float, node_id: Optional[str] = None) -> None:
        self.tasks_completed += 1
        self._latencies.append(latency_ms)
        if node_id:
            self._node_completed[node_id] = self._node_completed.get(node_id, 0) + 1

    def record_failure(self, node_id: Optional[str] = None) -> None:
        self.tasks_failed += 1
        if node_id:
            self._node_failed[node_id] = self._node_failed.get(node_id, 0) + 1

    def record_retry(self) -> None:
        self.tasks_retried += 1

    @property
    def throughput(self) -> float:
        elapsed = time.time() - self._start_time
        return (self.tasks_completed / elapsed) if elapsed > 0 else 0.0

    @property
    def avg_latency_ms(self) -> float:
        if not self._latencies:
            return 0.0
        return sum(self._latencies) / len(self._latencies)

    @property
    def p99_latency_ms(self) -> float:
        if not self._latencies:
            return 0.0
        sorted_lats = sorted(self._latencies)
        idx = int(len(sorted_lats) * 0.99)
        return sorted_lats[idx]

    @property
    def failure_rate(self) -> float:
        total = self.tasks_completed + self.tasks_failed
        return (self.tasks_failed / total) if total > 0 else 0.0

    def snapshot(self) -> dict:
        return {
            "submitted": self.tasks_submitted,
            "completed": self.tasks_completed,
            "failed": self.tasks_failed,
            "retried": self.tasks_retried,
            "throughput_tps": round(self.throughput, 1),
            "avg_latency_ms": round(self.avg_latency_ms, 2),
            "p99_latency_ms": round(self.p99_latency_ms, 2),
            "failure_rate": round(self.failure_rate, 4),
            "uptime_sec": round(time.time() - self._start_time, 1),
            "nodes": {
                "completed": dict(self._node_completed),
                "failed": dict(self._node_failed),
            },
        }


# Global singleton
_metrics: Optional[MetricsCollector] = None


def get_metrics() -> MetricsCollector:
    global _metrics
    if _metrics is None:
        _metrics = MetricsCollector()
    return _metrics


def reset_metrics() -> None:
    global _metrics
    _metrics = MetricsCollector()

