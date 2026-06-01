"""
NAMI-VET Backend — FastAPI Application Entry Point

Starts the local backend server with:
  - CORS for localhost origins
  - FFmpeg binary verification on startup
  - Whisper model pre-loading
  - ASCII art banner
  - All API routes registered under /api/v1
"""

import asyncio
import os
import sys
from contextlib import asynccontextmanager

# Windows: use ProactorEventLoop so asyncio.create_subprocess_exec works.
# The Microsoft Store Python 3.13 defaults to SelectorEventLoop which
# raises NotImplementedError when spawning subprocesses.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables before importing services
load_dotenv()

from routers import ai_chat, audio, subtitles, video
from services.ffmpeg_service import FFmpegError, ffmpeg_service
from services.whisper_service import whisper_service


# ── ASCII Art Banner ─────────────────────────────────────────

BANNER = """
\033[38;2;255;140;0m
  ███╗   ██╗ █████╗ ███╗   ███╗██╗    ██╗   ██╗███████╗████████╗
  ████╗  ██║██╔══██╗████╗ ████║██║    ██║   ██║██╔════╝╚══██╔══╝
  ██╔██╗ ██║███████║██╔████╔██║██║    ██║   ██║█████╗     ██║   
  ██║╚██╗██║██╔══██║██║╚██╔╝██║██║    ╚██╗ ██╔╝██╔══╝     ██║   
  ██║ ╚████║██║  ██║██║ ╚═╝ ██║██║     ╚████╔╝ ███████╗   ██║   
  ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝      ╚═══╝  ╚══════╝   ╚═╝   
\033[0m
  \033[38;2;255;183;77mAI-Powered Video Editing Tool — Local Backend\033[0m
  ─────────────────────────────────────────────
"""


# ── Lifespan ─────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle events."""
    print(BANNER)

    # 1. Verify FFmpeg binary
    print("  Checking dependencies...")
    try:
        ffmpeg_path = ffmpeg_service.find_binary()
        print(f"  ✓ FFmpeg found: {ffmpeg_path}")
    except FFmpegError as e:
        print(f"  ✗ FFmpeg NOT found: {e}")
        print("    → Set FFMPEG_PATH in .env or add ffmpeg to your PATH")

    # 2. Load Whisper model
    print("  Loading Whisper model...")
    whisper_service.load_model()

    # 3. Print registered routes
    print("\n  Registered routes:")
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            methods = ", ".join(route.methods)
            print(f"    {methods:8s} {route.path}")

    print(f"\n  \033[38;2;255;140;0m✓ Backend ready at http://localhost:8000\033[0m")
    print(f"  \033[38;2;255;140;0m✓ API docs at http://localhost:8000/docs\033[0m\n")

    yield

    # Shutdown
    print("\n  Shutting down NAMI-VET backend...")


# ── FastAPI App ──────────────────────────────────────────────

app = FastAPI(
    title="NAMI-VET Backend",
    description="AI-Powered Video Editing Tool — Local Backend API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — restricted to localhost origins in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(video.router)
app.include_router(audio.router)
app.include_router(subtitles.router)
app.include_router(ai_chat.router)


# ── WebSocket Sync Endpoint ──────────────────────────────────
from services.ws_manager import ws_manager
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    await ws_manager.connect(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(project_id, websocket)



# ── Health Check ─────────────────────────────────────────────

@app.get("/api/v1/health", tags=["system"])
async def health_check():
    """System health check endpoint."""
    return {
        "status": "healthy",
        "service": "nami-vet-backend",
        "version": "1.0.0",
        "ffmpeg_available": ffmpeg_service._binary_path is not None,
        "whisper_loaded": whisper_service.is_loaded,
    }


# ── Run directly ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
