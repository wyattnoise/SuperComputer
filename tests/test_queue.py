"""Queue unit tests"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supercompute.queue.task_queue import TaskQueue, QueueItem, QueuePriority


def test_queue_put_get():
    q = TaskQueue()
    item = QueueItem(priority=QueuePriority.NORMAL, created_at=100.0, id="t1")
    q.put(item)
    assert q.size == 1
    got = q.get()
    assert got is not None
    assert got.id == "t1"
    assert q.is_empty
    print("  ✅ test_queue_put_get")


def test_queue_priority_order():
    q = TaskQueue()
    q.put(QueueItem(QueuePriority.NORMAL, 1.0, "normal"))
    q.put(QueueItem(QueuePriority.CRITICAL, 2.0, "critical"))
    q.put(QueueItem(QueuePriority.LOW, 3.0, "low"))
    first = q.get()
    second = q.get()
    third = q.get()
    assert first.id == "critical"
    assert second.id == "normal"
    assert third.id == "low"
    print("  ✅ test_queue_priority_order")


def test_queue_fifo_same_priority():
    q = TaskQueue()
    q.put(QueueItem(QueuePriority.NORMAL, 1.0, "first"))
    q.put(QueueItem(QueuePriority.NORMAL, 2.0, "second"))
    assert q.get().id == "first"
    assert q.get().id == "second"
    print("  ✅ test_queue_fifo_same_priority")


def test_queue_retry():
    q = TaskQueue()
    q.put(QueueItem(QueuePriority.NORMAL, 1.0, "t1", max_retries=2))
    q.get()
    assert q.retry("t1") is True
    assert q.size == 1
    q.get()
    assert q.retry("t1") is True
    q.get()
    assert q.retry("t1") is False  # exhausted
    print("  ✅ test_queue_retry")


def test_queue_remove():
    q = TaskQueue()
    q.put(QueueItem(QueuePriority.NORMAL, 1.0, "t1"))
    q.put(QueueItem(QueuePriority.NORMAL, 2.0, "t2"))
    assert q.remove("t1") is True
    assert q.size == 1
    assert q.get().id == "t2"
    print("  ✅ test_queue_remove")


def test_queue_maxsize():
    q = TaskQueue(maxsize=2)
    q.put(QueueItem(QueuePriority.NORMAL, 1.0, "t1"))
    q.put(QueueItem(QueuePriority.NORMAL, 2.0, "t2"))
    try:
        q.put(QueueItem(QueuePriority.NORMAL, 3.0, "t3"))
        assert False, "Should have raised"
    except RuntimeError:
        pass
    print("  ✅ test_queue_maxsize")


def test_queue_peek():
    q = TaskQueue()
    assert q.peek() is None
    q.put(QueueItem(QueuePriority.HIGH, 1.0, "t1"))
    assert q.peek().id == "t1"
    assert q.size == 1  # peek doesn't remove
    print("  ✅ test_queue_peek")


if __name__ == "__main__":
    for fn in [test_queue_put_get, test_queue_priority_order, test_queue_fifo_same_priority,
               test_queue_retry, test_queue_remove, test_queue_maxsize, test_queue_peek]:
        fn()
    print("  ✅ all queue tests passed")

