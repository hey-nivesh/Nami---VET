"""
WebSocket Connection Manager — manages active live-sync connections per project.
"""

from typing import Dict, List
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # Map project_id to a list of active WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, project_id: str, websocket: WebSocket):
        """Accept a connection and register it for a project."""
        await websocket.accept()
        if project_id not in self.active_connections:
            self.active_connections[project_id] = []
        self.active_connections[project_id].append(websocket)
        print(f"[WS] Connected client for project {project_id}. Total: {len(self.active_connections[project_id])}")

    def disconnect(self, project_id: str, websocket: WebSocket):
        """Deregister a connection from a project."""
        if project_id in self.active_connections:
            if websocket in self.active_connections[project_id]:
                self.active_connections[project_id].remove(websocket)
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]
        print(f"[WS] Disconnected client for project {project_id}.")

    async def broadcast(self, project_id: str, message: dict):
        """Send a message to all connected clients for a project."""
        if project_id not in self.active_connections:
            return

        print(f"[WS] Broadcasting to project {project_id}: {message.get('event')}")
        disconnected = []
        for connection in self.active_connections[project_id]:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        # Clean up stale connections
        for conn in disconnected:
            self.disconnect(project_id, conn)


# Singleton manager instance
ws_manager = ConnectionManager()
