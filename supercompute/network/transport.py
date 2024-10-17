from __future__ import annotations
import json
from typing import Any, Callable, Optional


class Transport:
    """Abstract transport layer for RPC communication."""

    def send(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def serve(self, handler: Callable) -> None:
        raise NotImplementedError


class InProcessTransport(Transport):
    """In-process transport: direct function call, no serialization overhead."""

    def __init__(self):
        self._handler: Optional[Callable] = None

    def serve(self, handler: Callable) -> None:
        self._handler = handler

    def send(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if self._handler is None:
            return {"error": "No handler registered"}
        return self._handler(method, params)


class HTTPTransport(Transport):
    """HTTP transport for remote RPC (future use)."""

    def __init__(self, base_url: str = "http://127.0.0.1:9000"):
        self.base_url = base_url
        self._client = None  # httpx client

    def send(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        import httpx
        response = httpx.post(
            f"{self.base_url}/rpc",
            json={"method": method, "params": params},
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()

    def serve(self, handler: Callable) -> None:
        import uvicorn
        from fastapi import FastAPI
        from pydantic import BaseModel

        app = FastAPI()

        class RPCRequest(BaseModel):
            method: str
            params: dict[str, Any] = {}

        @app.post("/rpc")
        async def rpc(req: RPCRequest):
            return handler(req.method, req.params)

        uvicorn.run(app, host="0.0.0.0", port=9000)



