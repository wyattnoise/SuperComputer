"""SuperCompute Test Suite"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supercompute.core.task import Task, TaskStatus, TaskPriority
from supercompute.core.node import Node, NodeStatus, NodeSpec
from supercompute.core.scheduler import Scheduler, SchedulingStrategy
from supercompute.runtime.cluster import Cluster
import time


def test_task_creation():
    """Unit: Task lifecycle"""
    t = Task(name="test", payload={"x": 1})
    assert t.status == TaskStatus.PENDING
    assert t.id.startswith("task-")
    assert t.priority == TaskPriority.NORMAL
    assert t.can_retry() is True
    assert t.retries == 0
    assert t.age > 0
    print("  ✅ test_task_creation")


def test_task_retry_limit():
    """Unit: Task exhausts retries"""
    t = Task(max_retries=2)
    for _ in range(2):
        assert t.can_retry()
        t.retries += 1
    assert t.can_retry() is False
    print("  ✅ test_task_retry_limit")


def test_node_heartbeat():
    """Unit: Node health tracking"""
    n = Node()
    n.heartbeat()
    assert n.is_alive is True
    # Simulate stale heartbeat
    n.last_heartbeat = time.time() - 60
    assert n.is_alive is False
    print("  ✅ test_node_heartbeat")


def test_node_score():
    """Unit: Score-based scheduling calculation"""
    n = Node(spec=NodeSpec())
    # Idle node should have low score
    assert n.score == 0.0
    # Busy node
    n.current_load = 0.8
    n.queue_length = 5
    assert n.score > 0.0
    print("  ✅ test_node_score")


def test_scheduler_submit():
    """Unit: Scheduler task lifecycle"""
    sched = Scheduler()
    t = Task(name="test")
    task_id = sched.submit_task(t)
    assert task_id == t.id
    assert sched.tasks[task_id].status == TaskStatus.QUEUED
    print("  ✅ test_scheduler_submit")


def test_scheduler_schedule():
    """Integration: Scheduler assigns tasks to nodes"""
    sched = Scheduler(strategy=SchedulingStrategy.ROUND_ROBIN)
    for i in range(3):
        n = Node(id=f"node-{i+1}", spec=NodeSpec(), status="idle")
        sched.register_node(n)

    t = Task(name="compute")
    sched.submit_task(t)
    assigned = sched.schedule()
    assert assigned == t.id
    assert sched.tasks[t.id].status == TaskStatus.RUNNING
    assert sched.tasks[t.id].node_id is not None
    print("  ✅ test_scheduler_schedule")


def test_scheduler_complete():
    """Integration: Task completion flow"""
    sched = Scheduler()
    n = Node(id="node-1", spec=NodeSpec(), status="idle")
    sched.register_node(n)

    t = Task(name="compute")
    sched.submit_task(t)
    sched.schedule()
    sched.complete_task(t.id, 42)
    assert sched.tasks[t.id].status == TaskStatus.COMPLETED
    assert sched.tasks[t.id].result == 42
    print("  ✅ test_scheduler_complete")


def test_scheduler_fail_retry():
    """Integration: Failed task retries"""
    sched = Scheduler()
    n = Node(id="node-1", spec=NodeSpec(), status="idle")
    sched.register_node(n)

    t = Task(name="failing", max_retries=2)
    sched.submit_task(t)
    sched.schedule()
    sched.fail_task(t.id, "oops")
    assert sched.tasks[t.id].status == TaskStatus.QUEUED  # Re-queued
    assert sched.tasks[t.id].retries == 1
    print("  ✅ test_scheduler_fail_retry")


def test_dead_node_detection():
    """Integration: Dead nodes detected and tasks reassigned"""
    sched = Scheduler()
    n = Node(id="node-1", spec=NodeSpec(), status="idle")
    n.last_heartbeat = time.time() - 60  # Stale
    sched.register_node(n)

    t = Task(name="compute")
    sched.submit_task(t)
    sched.schedule()  # Assigns to dead node

    dead = sched.detect_dead_nodes()
    assert "node-1" in dead
    assert sched.tasks[t.id].status == TaskStatus.QUEUED  # Re-queued
    print("  ✅ test_dead_node_detection")


def test_cluster_submit():
    """Integration: Full cluster lifecycle"""
    cluster = Cluster(strategy="score_based", num_nodes=3)
    cluster.start()
    task_id = cluster.submit("integration-test", {"data": 42})
    assert task_id is not None
    results = cluster.wait_for_completion(max_tasks=1, timeout=10.0)
    assert len(results) == 1
    assert results[0]["id"] == task_id
    assert results[0]["result"] is not None
    cluster.stop()
    print("  ✅ test_cluster_submit")


def test_multiple_strategies():
    """Integration: All scheduling strategies work"""
    for strategy in SchedulingStrategy:
        sched = Scheduler(strategy=strategy)
        for i in range(2):
            n = Node(id=f"node-{i+1}", spec=NodeSpec(), status="idle")
            sched.register_node(n)
        t = Task(name="strat-test")
        sched.submit_task(t)
        assert sched.schedule() is not None
    print("  ✅ test_multiple_strategies")


def test_node_task_tracking():
    """Unit: Node tracks completed/failed tasks"""
    n = Node(spec=NodeSpec())
    n.complete_task(0.5)
    n.complete_task(1.5)
    n.fail_task()
    assert n.tasks_completed == 2
    assert n.tasks_failed == 1
    assert n.avg_task_time == 1.0
    print("  ✅ test_node_task_tracking")


if __name__ == "__main__":
    tests = [
        test_task_creation,
        test_task_retry_limit,
        test_node_heartbeat,
        test_node_score,
        test_node_task_tracking,
        test_scheduler_submit,
        test_scheduler_schedule,
        test_scheduler_complete,
        test_scheduler_fail_retry,
        test_dead_node_detection,
        test_multiple_strategies,
        test_cluster_submit,
    ]

    passed = 0
    failed = 0
    print("\n🧪 SuperCompute Test Suite\n")
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"  ❌ {test.__name__}: {e}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed, {len(tests)} total")
    sys.exit(1 if failed > 0 else 0)


