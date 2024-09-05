from __future__ import annotations
import time
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from ..core.task import Task, TaskPriority
from ..runtime.cluster import Cluster
from ..config import load_config, Config

logger = logging.getLogger("supercompute.api")
_cluster: Cluster | None = None


class SubmitRequest(BaseModel):
    name: str
    payload: dict = {}
    priority: int = 1


class SubmitResponse(BaseModel):
    task_id: str
    status: str


class TaskResponse(BaseModel):
    task_id: str
    name: str
    status: str
    priority: int
    node_id: str | None
    created_at: float
    completed_at: float | None
    duration: float | None
    error: str | None
    result: dict | None


def create_app(cluster: Cluster) -> FastAPI:
    global _cluster
    _cluster = cluster

    app = FastAPI(title="SuperCompute API", version="0.1.0")

    @app.post("/tasks", response_model=SubmitResponse)
    async def submit_task(req: SubmitRequest):
        task_id = cluster.submit(req.name, req.payload, req.priority)
        return SubmitResponse(task_id=task_id, status="queued")

    @app.get("/tasks/{task_id}", response_model=TaskResponse)
    async def get_task(task_id: str):
        task = cluster.scheduler.tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return TaskResponse(
            task_id=task.id,
            name=task.name,
            status=task.status.value,
            priority=task.priority.value,
            node_id=task.node_id,
            created_at=task.created_at,
            completed_at=task.completed_at,
            duration=task.duration,
            error=task.error,
            result=task.result if isinstance(task.result, dict) else {"value": task.result},
        )

    @app.get("/tasks")
    async def list_tasks(limit: int = 50):
        tasks = list(cluster.scheduler.tasks.values())[:limit]
        return [
            TaskResponse(
                task_id=t.id,
                name=t.name,
                status=t.status.value,
                priority=t.priority.value,
                node_id=t.node_id,
                created_at=t.created_at,
                completed_at=t.completed_at,
                duration=t.duration,
                error=t.error,
                result=t.result if isinstance(t.result, dict) else {"value": t.result},
            )
            for t in tasks
        ]

    @app.get("/nodes")
    async def list_nodes():
        return {
            nid: {
                "status": n.status.value,
                "load": n.current_load,
                "score": round(n.score, 3),
                "tasks_completed": n.tasks_completed,
                "tasks_failed": n.tasks_failed,
                "is_alive": n.is_alive,
            }
            for nid, n in cluster.nodes.items()
        }

    @app.get("/stats")
    async def stats():
        return cluster.get_stats()

    return app


def run_api(cluster: Cluster, config: Config) -> None:
    import uvicorn
    app = create_app(cluster)
    uvicorn.run(
        app,
        host=config.api.host,
        port=config.api.port,
        log_level="info",
    )


