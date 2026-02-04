#!/usr/bin/env python3
"""Adaptive scheduling demo: compare strategies."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supercompute.core.scheduler import Scheduler, SchedulingStrategy
from supercompute.core.task import Task, TaskPriority
from supercompute.core.node import Node, NodeSpec
import time


def demo_strategy(strategy: SchedulingStrategy, num_tasks: int = 10) -> dict:
    scheduler = Scheduler(strategy=strategy)
    for i in range(4):
        n = Node(
            id=f"node-{i+1}",
            spec=NodeSpec(cpu_cores=4, memory_gb=8.0),
            status="idle",
        )
        scheduler.register_node(n)

    for i in range(num_tasks):
        t = Task(name=f"task-{i}", priority=TaskPriority.NORMAL)
        scheduler.submit_task(t)

    for _ in range(num_tasks):
        scheduler.schedule()

    # Complete simulated tasks
    for task in scheduler.tasks.values():
        if task.node_id:
            scheduler.complete_task(task.id, {"ok": True})

    return scheduler.get_stats()


def main():
    print("📊 Adaptive Scheduling Comparison")
    print("=" * 50)

    for strategy in SchedulingStrategy:
        start = time.time()
        stats = demo_strategy(strategy, num_tasks=20)
        elapsed = time.time() - start
        print(f"\n  Strategy: {strategy.value}")
        print(f"    Tasks: {stats['total_tasks']} | Time: {elapsed:.3f}s")
        by_node = {}
        for t in stats.keys():
            pass
        print(f"    Nodes used: {stats['active_nodes']}/{stats['total_nodes']}")


if __name__ == "__main__":
    main()

