"""Scheduler unit + integration tests"""
import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supercompute.core.task import Task, TaskStatus
from supercompute.core.node import Node, NodeSpec
from supercompute.core.scheduler import Scheduler, SchedulingStrategy


def test_scheduler_submit():
    sched = Scheduler()
    t = Task(name="test")
    task_id = sched.submit_task(t)
    assert task_id == t.id
    assert sched.tasks[task_id].status == TaskStatus.QUEUED
    print("  ✅ test_scheduler_submit")


def test_scheduler_schedule():
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
    sched = Scheduler()
    n = Node(id="node-1", spec=NodeSpec(), status="idle")
    sched.register_node(n)
    t = Task(name="failing", max_retries=2)
    sched.submit_task(t)
    sched.schedule()
    sched.fail_task(t.id, "oops")
    assert sched.tasks[t.id].status == TaskStatus.QUEUED  # re-queued
    assert sched.tasks[t.id].retries == 1
    print("  ✅ test_scheduler_fail_retry")


def test_dead_node_detection():
    sched = Scheduler()
    n = Node(id="node-1", spec=NodeSpec(), status="idle")
    n.last_heartbeat = time.time() - 60  # stale
    sched.register_node(n)
    t = Task(name="compute")
    sched.submit_task(t)
    sched.schedule()
    dead = sched.detect_dead_nodes()
    assert "node-1" in dead
    assert sched.tasks[t.id].status == TaskStatus.QUEUED  # re-queued
    print("  ✅ test_dead_node_detection")


def test_multiple_strategies():
    for strategy in SchedulingStrategy:
        sched = Scheduler(strategy=strategy)
        for i in range(2):
            n = Node(id=f"node-{i+1}", spec=NodeSpec(), status="idle")
            sched.register_node(n)
        t = Task(name="strat-test")
        sched.submit_task(t)
        assert sched.schedule() is not None
    print("  ✅ test_multiple_strategies")


def test_priority_ordering():
    sched = Scheduler()
    n = Node(id="node-1", spec=NodeSpec(), status="idle")
    sched.register_node(n)
    from supercompute.core.task import TaskPriority
    low = Task(name="low", priority=TaskPriority.LOW)
    high = Task(name="high", priority=TaskPriority.CRITICAL)
    sched.submit_task(low)
    sched.submit_task(high)
    # Schedule twice — high priority should go first
    first = sched.schedule()
    assert sched.tasks[first].name == "high"
    print("  ✅ test_priority_ordering")


def test_scheduler_stats():
    sched = Scheduler()
    stats = sched.get_stats()
    assert "total_tasks" in stats
    assert "active_nodes" in stats
    assert "strategy" in stats
    print("  ✅ test_scheduler_stats")


if __name__ == "__main__":
    for fn in [test_scheduler_submit, test_scheduler_schedule, test_scheduler_complete,
               test_scheduler_fail_retry, test_dead_node_detection, test_multiple_strategies,
               test_priority_ordering, test_scheduler_stats]:
        fn()
    print("  ✅ all scheduler tests passed")




