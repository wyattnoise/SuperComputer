#!/usr/bin/env python3
"""SuperCompute Benchmark Suite
Simulates throughput and latency across different cluster sizes.
"""
import sys
import os
import time
import statistics
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supercompute.core.scheduler import Scheduler, SchedulingStrategy
from supercompute.core.task import Task, TaskPriority
from supercompute.core.node import Node, NodeSpec


def run_benchmark(
    node_counts: list[int] = None,
    tasks_per_run: int = 100,
    strategy: str = "score_based",
) -> list[dict]:
    """Run throughput/latency benchmark for each node count."""
    if node_counts is None:
        node_counts = [1, 2, 4, 8, 16]

    results = []
    for num_nodes in node_counts:
        sched = Scheduler(strategy=strategy)

        # Create nodes
        for i in range(num_nodes):
            n = Node(
                id=f"node-{i+1}",
                spec=NodeSpec(cpu_cores=4, memory_gb=8.0),
                status="idle",
            )
            sched.register_node(n)

        # Submit tasks
        tasks = []
        for i in range(tasks_per_run):
            t = Task(name=f"bench-{i}", priority=TaskPriority.NORMAL)
            sched.submit_task(t)
            tasks.append(t.id)

        # Schedule and measure
        latencies = []
        start = time.time()
        for task_id in tasks:
            schedule_start = time.time()
            sched.schedule()
            schedule_end = time.time()

            task = sched.tasks.get(task_id)
            if task and task.node_id:
                # Simulate execution
                sched.complete_task(task_id, {"ok": True})
                latencies.append((schedule_end - schedule_start) * 1000)  # ms

        elapsed = time.time() - start
        throughput = tasks_per_run / elapsed if elapsed > 0 else 0

        if latencies:
            avg_latency = statistics.mean(latencies)
            p99 = sorted(latencies)[int(len(latencies) * 0.99)]
        else:
            avg_latency = 0
            p99 = 0

        results.append({
            "nodes": num_nodes,
            "throughput": round(throughput, 1),
            "avg_latency_ms": round(avg_latency, 2),
            "p99_latency_ms": round(p99, 2),
            "total_time_s": round(elapsed, 3),
        })

        print(f"  Nodes: {num_nodes:2d} → {throughput:6.1f} tasks/s, "
              f"avg {avg_latency:6.2f}ms, p99 {p99:6.2f}ms")

    return results


def main():
    print("\n📊 SuperCompute Benchmark Suite")
    print("=" * 60)
    print("Simulating throughput across cluster sizes...\n")

    results = run_benchmark(
        node_counts=[1, 2, 4, 8, 16],
        tasks_per_run=200,
        strategy="score_based",
    )

    print("\n" + "=" * 60)
    print("Summary:")
    print(f"{'Nodes':>6} | {'Throughput':>12} | {'Avg Latency':>12} | {'P99 Latency':>12}")
    print("-" * 50)
    for r in results:
        print(f"{r['nodes']:6d} | {r['throughput']:10.1f} tasks/s | "
              f"{r['avg_latency_ms']:10.2f}ms | {r['p99_latency_ms']:10.2f}ms")

    return 0


if __name__ == "__main__":
    sys.exit(main())



