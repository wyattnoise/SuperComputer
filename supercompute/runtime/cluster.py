from __future__ import annotations
import time
import logging
import threading
from typing import Optional, Callable
from ..core.scheduler import Scheduler, SchedulingStrategy
from ..core.node import Node, NodeSpec, NodeStatus
from ..core.task import Task, TaskStatus

logger = logging.getLogger("supercompute.runtime.cluster")


class Cluster:
    """Manages a group of worker nodes and the scheduler."""

    def __init__(
        self,
        strategy: str | SchedulingStrategy = SchedulingStrategy.SCORE_BASED,
        num_nodes: int = 3,
    ):
        self.scheduler = Scheduler(strategy=strategy)
        self.nodes: dict[str, Node] = {}
        self.running = False
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._scheduler_thread: Optional[threading.Thread] = None
        self._on_task_complete: Optional[Callable[[str, object], None]] = None

        # Create initial nodes
        for i in range(num_nodes):
            node = Node(
                id=f"node-{i+1}",
                host="127.0.0.1",
                port=9001 + i,
                spec=NodeSpec(
                    cpu_cores=4,
                    memory_gb=8.0,
                    region="default",
                ),
                status=NodeStatus.IDLE,
            )
            self.add_node(node)

    def add_node(self, node: Node) -> None:
        self.nodes[node.id] = node
        self.scheduler.register_node(node)
        logger.info({"event": "cluster_add_node", "node_id": node.id})

    def remove_node(self, node_id: str) -> None:
        if node_id in self.nodes:
            del self.nodes[node_id]
            self.scheduler.unregister_node(node_id)
            logger.info({"event": "cluster_remove_node", "node_id": node_id})

    def submit(self, name: str, payload: dict = None, priority: int = 1) -> str:
        task = Task(name=name, payload=payload or {}, priority=priority)
        return self.scheduler.submit_task(task)

    def _heartbeat_loop(self) -> None:
        while self.running:
            for node in self.nodes.values():
                node.heartbeat()
            dead = self.scheduler.detect_dead_nodes()
            time.sleep(5)

    def _schedule_loop(self) -> None:
        while self.running:
            try:
                task_id = self.scheduler.schedule()
                if task_id:
                    task = self.scheduler.tasks[task_id]
                    # Simulate execution
                    node = self.nodes.get(task.node_id or "")
                    if node:
                        time.sleep(0.1)  # Simulated compute
                        self.scheduler.complete_task(task_id, {"output": f"Executed on {node.id}", "value": 42})
                        if self._on_task_complete:
                            self._on_task_complete(task_id, task.result)
            except Exception as e:
                logger.error({"event": "schedule_error", "error": str(e)})
            time.sleep(0.5)

    def start(self) -> None:
        self.running = True
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._scheduler_thread = threading.Thread(target=self._schedule_loop, daemon=True)
        self._heartbeat_thread.start()
        self._scheduler_thread.start()
        logger.info({"event": "cluster_started", "nodes": len(self.nodes)})

    def stop(self) -> None:
        self.running = False
        logger.info({"event": "cluster_stopped"})

    def get_stats(self) -> dict:
        base = self.scheduler.get_stats()
        base["cluster_nodes"] = {
            nid: {"status": n.status.value, "load": n.current_load, "score": round(n.score, 3)}
            for nid, n in self.nodes.items()
        }
        return base

    def wait_for_completion(self, max_tasks: int = 5, timeout: float = 30.0) -> list[dict]:
        """Wait for a batch of tasks to complete."""
        completed = []
        start = time.time()
        initial_completed = sum(1 for t in self.scheduler.tasks.values() if t.status == TaskStatus.COMPLETED)
        target = initial_completed + max_tasks

        while len(completed) < max_tasks and (time.time() - start) < timeout:
            for task in self.scheduler.tasks.values():
                if task.status == TaskStatus.COMPLETED and task.id not in {c.get("id") for c in completed}:
                    completed.append({
                        "id": task.id,
                        "name": task.name,
                        "node_id": task.node_id,
                        "duration": task.duration,
                        "result": task.result,
                    })
            time.sleep(0.2)

        return completed
