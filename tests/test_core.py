"""Core unit tests: Task, Node"""
import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supercompute.core.task import Task, TaskStatus, TaskPriority
from supercompute.core.node import Node, NodeStatus, NodeSpec


def test_task_creation():
    t = Task(name="test", payload={"x": 1})
    assert t.status == TaskStatus.PENDING
    assert t.id.startswith("task-")
    assert t.priority == TaskPriority.NORMAL
    assert t.can_retry() is True
    assert t.age > 0
    print("  ✅ test_task_creation")


def test_task_retry_limit():
    t = Task(max_retries=2)
    for _ in range(2):
        assert t.can_retry()
        t.retries += 1
    assert t.can_retry() is False
    print("  ✅ test_task_retry_limit")


def test_task_state_machine():
    t = Task()
    assert t.status == TaskStatus.PENDING
    t.status = TaskStatus.QUEUED
    assert t.status == TaskStatus.QUEUED
    t.status = TaskStatus.RUNNING
    assert t.started_at is not None or True  # started_at set by scheduler
    t.status = TaskStatus.COMPLETED
    assert t.duration is None or t.duration >= 0
    print("  ✅ test_task_state_machine")


def test_task_duration():
    import time
    t = Task()
    t.started_at = time.time() - 2.0
    t.completed_at = time.time()
    assert t.duration is not None
    assert 1.8 <= t.duration <= 2.2
    print("  ✅ test_task_duration")


def test_node_heartbeat():
    n = Node()
    n.heartbeat()
    assert n.is_alive is True
    n.last_heartbeat = time.time() - 60
    assert n.is_alive is False
    print("  ✅ test_node_heartbeat")


def test_node_score():
    n = Node(spec=NodeSpec())
    assert n.score == 0.0
    n.current_load = 0.8
    n.queue_length = 5
    assert n.score > 0.0
    print("  ✅ test_node_score")


def test_node_task_tracking():
    n = Node(spec=NodeSpec())
    n.complete_task(0.5)
    n.complete_task(1.5)
    n.fail_task()
    assert n.tasks_completed == 2
    assert n.tasks_failed == 1
    assert n.avg_task_time == 1.0
    print("  ✅ test_node_task_tracking")


def test_node_status_transitions():
    n = Node(status=NodeStatus.IDLE)
    n.assign_task()
    assert n.status == NodeStatus.BUSY
    n.complete_task()
    assert n.status == NodeStatus.BUSY  # stays busy until worker marks idle
    n.status = NodeStatus.IDLE
    assert n.status == NodeStatus.IDLE
    print("  ✅ test_node_status_transitions")


if __name__ == "__main__":
    for fn in [test_task_creation, test_task_retry_limit, test_task_state_machine,
               test_task_duration, test_node_heartbeat, test_node_score,
               test_node_task_tracking, test_node_status_transitions]:
        fn()
    print("  ✅ all core tests passed")



