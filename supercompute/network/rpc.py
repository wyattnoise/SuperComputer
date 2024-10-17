from __future__ import annotations
import json
import logging
from typing import Any, Callable, Optional
from .transport import Transport, InProcessTransport

logger = logging.getLogger("supercompute.network.rpc")


class RPCServer:
    """Lightweight RPC server wrapping a transport layer."""

    def __init__(self, transport: Optional[Transport] = None):
        self.transport = transport or InProcessTransport()
        self._handlers: dict[str, Callable] = {}
        self.running = False

    def register(self, method: str, handler: Callable) -> None:
        self._handlers[method] = handler
        logger.debug({"event": "rpc_register", "method": method})

    def handle(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        handler = self._handlers.get(method)
        if not handler:
            return {"error": f"Unknown method: {method}"}
        try:
            result = handler(**params)
            return {"result": result}
        except Exception as e:
            logger.error({"event": "rpc_error", "method": method, "error": str(e)})
            return {"error": str(e)}

    def start(self) -> None:
        self.running = True
        self.transport.serve(self.handle)
        logger.info({"event": "rpc_server_started"})


class RPCClient:
    """Lightweight RPC client."""

    def __init__(self, transport: Optional[Transport] = None):
        self.transport = transport or InProcessTransport()

    def call(self, method: str, **params: Any) -> Any:
        logger.debug({"event": "rpc_call", "method": method})
        response = self.transport.send(method, params)
        if "error" in response:
            raise RuntimeError(response["error"])
        return response["result"]





