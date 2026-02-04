#!/usr/bin/env python3
"""Hello World - SuperCompute Demo

Run: python examples/hello_world.py
Expected output:
  [Scheduler] task assigned to node-2
  [node-2] executing task...
  [result] 42
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supercompute.core.task import Task
from supercompute.core.scheduler import Scheduler
from supercompute.core.node import Node, NodeSpec


def main():
    print("🚀 SuperCompute Hello World Demo")
    print("=" * 40)

    # Create scheduler
    scheduler = Scheduler(strategy="score_based")

    # Create worker nodes
    for i in range(3):
        node = Node(
            id=f"node-{i+1}",
            host="127.0.0.1",
            port=9001 + i,
            spec=NodeSpec(cpu_cores=4, memory_gb=8.0),
            status="idle",
        )
        scheduler.register_node(node)
        print(f"[Setup] registered {node.id}")

    # Submit a task
    task = Task(name="compute-answer", payload={"question": "meaning of life"})
    task_id = scheduler.submit_task(task)
    print(f"[Scheduler] task submitted: {task_id}")

    # Schedule it
    assigned_id = scheduler.schedule()
    if assigned_id:
        assigned = scheduler.tasks[assigned_id]
        node = scheduler.nodes.get(assigned.node_id or "")
        print(f"[Scheduler] task assigned to {assigned.node_id}")

        # Simulate execution
        if node:
            print(f"[{node.id}] executing task...")
            import time
            time.sleep(0.1)
            scheduler.complete_task(assigned_id, {"value": 42})

        print(f"[result] {assigned.result['value']}")
    else:
        print("[Scheduler] no available nodes")

    # Stats
    stats = scheduler.get_stats()
    print(f"\n📊 Stats: {stats['tasks_by_status']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())


