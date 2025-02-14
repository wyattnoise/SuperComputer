"""Runtime integration tests: Cluster, Worker"""
import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supercompute.runtime.cluster import Cluster
from supercompute.core.scheduler import SchedulingStrategy


def test_cluster_creation():
    c = Cluster(strategy="score_based", num_nodes=3)
    assert len(c.nodes) == 3
    assert len(c.scheduler.nodes) == 3
    print("  ✅ test_cluster_creation")


def test_cluster_submit():
    c = Cluster(strategy="score_based", num_nodes=3)
    c.start()
    task_id = c.submit("integration-test", {"data": 42})
    assert task_id is not None
    results = c.wait_for_completion(max_tasks=1, timeout=10.0)
    assert len(results) == 1
    assert results[0]["id"] == task_id
    assert results[0]["result"] is not None
    c.stop()
    print("  ✅ test_cluster_submit")


def test_cluster_multiple_tasks():
    c = Cluster(strategy="score_based", num_nodes=3)
    c.start()
    ids = []
    for i in range(5):
        ids.append(c.submit(f"task-{i}", {"n": i}))
    results = c.wait_for_completion(max_tasks=5, timeout=15.0)
    assert len(results) == 5
    c.stop()
    print("  ✅ test_cluster_multiple_tasks")


def test_cluster_stats():
    c = Cluster(strategy="score_based", num_nodes=2)
    c.start()
    c.submit("test", {})
    time.sleep(1)
    stats = c.get_stats()
    assert stats["total_tasks"] >= 1
    assert stats["total_nodes"] == 2
    c.stop()
    print("  ✅ test_cluster_stats")


def test_cluster_start_stop():
    c = Cluster(strategy="score_based", num_nodes=2)
    c.start()
    assert c.running is True
    c.stop()
    assert c.running is False
    print("  ✅ test_cluster_start_stop")


def test_different_strategies():
    for s in ["round_robin", "random", "least_loaded", "score_based"]:
        c = Cluster(strategy=s, num_nodes=2)
        c.start()
        c.submit(f"strat-{s}", {})
        results = c.wait_for_completion(max_tasks=1, timeout=10.0)
        assert len(results) == 1
        c.stop()
    print("  ✅ test_different_strategies")


if __name__ == "__main__":
    for fn in [test_cluster_creation, test_cluster_submit, test_cluster_multiple_tasks,
               test_cluster_stats, test_cluster_start_stop, test_different_strategies]:
        fn()
    print("  ✅ all runtime tests passed")

