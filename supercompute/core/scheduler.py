from __future__ import annotations
import time
import logging
import random
from enum import Enum
from typing import Optional
from .task import Task, TaskStatus
from .node import Node, NodeStatus

logger = logging.getLogger("supercompute.scheduler")


class SchedulingStrategy(str, Enum):
    ROUND_ROBIN = "round_robin"
    RANDOM = "random"
    LEAST_LOADED = "least_loaded"
    SCORE_BASED = "score_based"


class Scheduler:
    """Distributed task scheduler with configurable strategies."""

    def __init__(self, strategy: SchedulingStrategy = SchedulingStrategy.SCORE_BASED):
        self.strategy = strategy
        self.nodes: dict[str, Node] = {}
        self.tasks: dict[str, Task] = {}
        self._round_robin_idx = 0
        self.running = False

    def register_node(self, node: Node) -> None:
        self.nodes[node.id] = node
        logger.info({"event": "node_registered", "node_id": node.id, "total_nodes": len(self.nodes)})

    def unregister_node(self, node_id: str) -> None:
        if node_id in self.nodes:
            del self.nodes[node_id]
            logger.info({"event": "node_unregistered", "node_id": node_id, "total_nodes": len(self.nodes)})

    def submit_task(self, task: Task) -> str:
        task.status = TaskStatus.QUEUED
        self.tasks[task.id] = task
        logger.info({"event": "task_submitted", "task_id": task.id, "name": task.name, "priority": task.priority.value})
        return task.id

    def _select_node_round_robin(self) -> Optional[Node]:
        alive = [n for n in self.nodes.values() if n.is_alive and n.status != NodeStatus.DEAD]
        if not alive:
            return None
        idx = self._round_robin_idx % len(alive)
        self._round_robin_idx += 1
        return alive[idx]

    def _select_node_random(self) -> Optional[Node]:
        alive = [n for n in self.nodes.values() if n.is_alive and n.status != NodeStatus.DEAD]
        return random.choice(alive) if alive else None

    def _select_node_least_loaded(self) -> Optional[Node]:
        alive = [n for n in self.nodes.values() if n.is_alive and n.status != NodeStatus.DEAD]
        if not alive:
            return None
        return min(alive, key=lambda n: (n.current_load, n.queue_length, n.score))

    def _select_node_score_based(self) -> Optional[Node]:
        """Adaptive scheduling: score = f(cpu_load, queue_length, failure_rate)"""
        alive = [n for n in self.nodes.values() if n.is_alive]
        if not alive:
            return None
        return min(alive, key=lambda n: n.score)

    def _select_node(self) -> Optional[Node]:
        selectors = {
            SchedulingStrategy.ROUND_ROBIN: self._select_node_round_robin,
            SchedulingStrategy.RANDOM: self._select_node_random,
            SchedulingStrategy.LEAST_LOADED: self._select_node_least_loaded,
            SchedulingStrategy.SCORE_BASED: self._select_node_score_based,
        }
        fn = selectors.get(self.strategy, self._select_node_score_based)
        return fn()

    def schedule(self) -> Optional[str]:
        """Execute one scheduling cycle. Returns assigned task_id or None."""
        pending = [t for t in self.tasks.values() if t.status == TaskStatus.QUEUED]
        if not pending:
            return None

        # Sort by priority desc, then age desc
        pending.sort(key=lambda t: (-t.priority.value, -t.created_at))
        task = pending[0]

        node = self._select_node()
        if not node:
            logger.warning({"event": "no_available_node", "task_id": task.id})
            return None

        task.status = TaskStatus.RUNNING
        task.node_id = node.id
        task.started_at = time.time()
        node.assign_task()
        logger.info({
            "event": "task_assigned",
            "task_id": task.id,
            "node_id": node.id,
            "strategy": self.strategy.value if hasattr(self.strategy, "value") else self.strategy,
        })
        return task.id

    def complete_task(self, task_id: str, result: object = None) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        task.status = TaskStatus.COMPLETED
        task.completed_at = time.time()
        task.result = result
        if task.node_id and task.node_id in self.nodes:
            self.nodes[task.node_id].complete_task(task.duration or 0)
        logger.info({"event": "task_completed", "task_id": task_id, "duration": task.duration})

    def fail_task(self, task_id: str, error: str) -> None:
        task = self.tasks.get(task_id)
        if not task:
            return
        task.retries += 1
        if task.can_retry():
            task.status = TaskStatus.RETRYING
            task.node_id = None
            task.started_at = None
            task.error = error
            # Re-queue for retry
            task.status = TaskStatus.QUEUED
            logger.info({"event": "task_retry", "task_id": task_id, "retry": task.retries, "max": task.max_retries})
        else:
            task.status = TaskStatus.FAILED
            task.completed_at = time.time()
            task.error = error
            if task.node_id and task.node_id in self.nodes:
                self.nodes[task.node_id].fail_task()
            logger.info({"event": "task_failed", "task_id": task_id, "error": error})

    def detect_dead_nodes(self) -> list[str]:
        dead: list[str] = []
        for node_id, node in list(self.nodes.items()):
            if not node.is_alive and node.status != NodeStatus.DEAD:
                node.status = NodeStatus.DEAD
                dead.append(node_id)
                # Reassign tasks from dead node
                for task in self.tasks.values():
                    if task.node_id == node_id and task.status == TaskStatus.RUNNING:
                        self.fail_task(task.id, f"Node {node_id} died")
                logger.warning({"event": "node_dead", "node_id": node_id})
        return dead

    def get_stats(self) -> dict:
        total = len(self.tasks)
        by_status = {}
        for s in TaskStatus:
            count = sum(1 for t in self.tasks.values() if t.status == s)
            if count > 0:
                by_status[s.value] = count
        return {
            "total_tasks": total,
            "tasks_by_status": by_status,
            "active_nodes": sum(1 for n in self.nodes.values() if n.is_alive),
            "total_nodes": len(self.nodes),
            "strategy": self.strategy.value if hasattr(self.strategy, "value") else self.strategy,
        }




