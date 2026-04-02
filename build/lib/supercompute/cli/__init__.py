from __future__ import annotations
import sys
import time
import click
from ..core.task import Task, TaskPriority
from ..runtime.cluster import Cluster
from ..config import load_config, ClusterConfig
from ..log_setup import setup_logging


@click.group()
@click.option("--config", "-c", default=None, help="Config file path")
@click.option("--log-level", default="INFO", help="Log level")
@click.pass_context
def cli(ctx, config, log_level):
    """SuperCompute - Distributed Compute Scheduling System"""
    setup_logging(level=log_level)
    cfg = load_config(config)
    ctx.ensure_object(dict)
    ctx.obj["config"] = cfg


@cli.command()
@click.option("--nodes", "-n", default=5, help="Number of worker nodes")
@click.option("--strategy", "-s", default="score_based",
              type=click.Choice(["round_robin", "random", "least_loaded", "score_based"]))
@click.option("--api-port", default=8080, help="API server port")
@click.pass_context
def start_cluster(ctx, nodes, strategy, api_port):
    """Start a local compute cluster."""
    click.echo(f"🚀 Starting SuperCompute cluster with {nodes} nodes ({strategy})")

    cluster = Cluster(strategy=strategy, num_nodes=nodes)
    cluster.start()

    cfg = ctx.obj["config"]
    cfg.cluster.nodes = nodes
    cfg.cluster.strategy = strategy
    cfg.api.port = api_port

    from ..api.server import run_api
    import threading
    api_thread = threading.Thread(target=run_api, args=(cluster, cfg), daemon=True)
    api_thread.start()

    click.echo(f"✅ Cluster running at http://{cfg.api.host}:{api_port}")
    click.echo("Press Ctrl+C to stop")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        click.echo("\n⏹ Stopping cluster...")
        cluster.stop()


@cli.command()
@click.argument("script")
@click.pass_context
def submit(ctx, script):
    """Submit a task script to the cluster."""
    click.echo(f"📤 Submitting {script}")
    with open(script) as f:
        code = f.read()
    cluster = Cluster(num_nodes=3)
    cluster.start()
    task_id = cluster.submit(f"run:{script}", {"code": code})
    results = cluster.wait_for_completion(max_tasks=1, timeout=30.0)
    if results:
        click.echo(f"✅ Result: {results[0]['result']}")
    else:
        click.echo("❌ Task did not complete")
    cluster.stop()


@cli.command()
@click.pass_context
def status(ctx):
    """Show cluster status."""
    click.echo("📊 SuperCompute Status")
    click.echo("  Run 'supercompute start-cluster' to start")
    click.echo("  or check API at http://localhost:8080")


@cli.command()
@click.option("--nodes", default="1,2,4,8", help="Comma-separated node counts")
@click.option("--tasks", default=100, help="Tasks per benchmark run")
@click.option("--strategy", default="score_based",
              type=click.Choice(["round_robin", "random", "least_loaded", "score_based"]))
def benchmark(nodes, tasks, strategy):
    """Run a throughput benchmark."""
    from ..benchmark.run import run_benchmark
    node_counts = [int(n) for n in nodes.split(",")]
    results = run_benchmark(node_counts=node_counts, tasks_per_run=tasks, strategy=strategy)
    click.echo("\n📊 Benchmark Results")
    click.echo("=" * 60)
    for r in results:
        click.echo(f"  Nodes: {r['nodes']:2d} | Throughput: {r['throughput']:6.1f} tasks/s | "
                   f"Avg latency: {r['avg_latency_ms']:6.2f}ms | "
                   f"P99: {r['p99_latency_ms']:6.2f}ms")


