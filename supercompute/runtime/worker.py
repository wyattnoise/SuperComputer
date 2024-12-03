from __future__ import annotations
import time
import logging
from typing import Any, Optional
from ..core.node import Node, NodeSpec, NodeStatus
from ..network.rpc import RPCClient

logger = logging.getLogger("supercompute.runtime.worker")


class Worker:
    """A compute worker that connects to the scheduler and executes tasks."""

    def __init__(self, node_id: Optional[str] = None, spec: Optional[NodeSpec] = None):
        self.node = Node(
            id=node_id or f"worker-{time.time_ns() % 10000}",
            spec=spec or NodeSpec(),
            status=NodeStatus.IDLE,
        )
        self.running = False

    def start(self) -> None:
        self.running = True
        self.node.status = NodeStatus.IDLE
        self.node.heartbeat()
        logger.info({"event": "worker_started", "node_id": self.node.id})

    def stop(self) -> None:
        self.running = False
        self.node.status = NodeStatus.OFFLINE
        logger.info({"event": "worker_stopped", "node_id": self.node.id})

    def execute(self, task: dict[str, Any]) -> dict[str, Any]:
        """Execute a task and return result."""
        self.node.status = NodeStatus.BUSY
        start = time.time()
        try:
            payload = task.get("payload", {})
            # Default executor: return payload + metadata
            result = {
                "output": f"Executed by {self.node.id}",
                "payload": payload,
                "executor": self.node.id,
                "timestamp": time.time(),
            }
            self.node.complete_task(time.time() - start)
            return result
        except Exception as e:
            self.node.fail_task()
            raise
        finally:
            if self.running:
                self.node.status = NodeStatus.IDLE

    def heartbeat(self) -> None:
        self.node.heartbeat()
