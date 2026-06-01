"""
Subtitles Router — REST endpoints for AI subtitle generation and export.

Endpoints:
  POST /api/v1/subtitles/generate
  POST /api/v1/subtitles/export
"""

import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.whisper_service import whisper_service

router = APIRouter(prefix="/api/v1/subtitles", tags=["subtitles"])


# ── Pydantic Models ──────────────────────────────────────────

class GenerateRequest(BaseModel):
    video_path: str = Field(..., description="Path to video/audio file")
    language: Optional[str] = Field(default=None, description="Language code (e.g. 'en', 'es')")


class SubtitleSegment(BaseModel):
    start: float
    end: float
    text: str


class GenerateResponse(BaseModel):
    success: bool
    segments: list[SubtitleSegment]
    total_segments: int
    language: Optional[str] = None


class ExportRequest(BaseModel):
    segments: list[SubtitleSegment] = Field(..., min_length=1)
    format: str = Field(default="srt", description="Export format: srt, vtt, or json")
    output_path: str = Field(..., description="Output file path")


class ExportResponse(BaseModel):
    success: bool
    message: str
    output_path: str


# ── Helpers ──────────────────────────────────────────────────

def _format_srt_time(seconds: float) -> str:
    """Format seconds as SRT timestamp: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _format_vtt_time(seconds: float) -> str:
    """Format seconds as WebVTT timestamp: HH:MM:SS.mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def _segments_to_srt(segments: list[SubtitleSegment]) -> str:
    """Convert subtitle segments to SRT format string."""
    lines: list[str] = []
    for i, seg in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{_format_srt_time(seg.start)} --> {_format_srt_time(seg.end)}")
        lines.append(seg.text)
        lines.append("")
    return "\n".join(lines)


def _segments_to_vtt(segments: list[SubtitleSegment]) -> str:
    """Convert subtitle segments to WebVTT format string."""
    lines: list[str] = ["WEBVTT", ""]
    for i, seg in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{_format_vtt_time(seg.start)} --> {_format_vtt_time(seg.end)}")
        lines.append(seg.text)
        lines.append("")
    return "\n".join(lines)


# ── Endpoints ────────────────────────────────────────────────

@router.post("/generate", response_model=GenerateResponse)
async def generate_subtitles(req: GenerateRequest):
    """
    Generate subtitles from a video/audio file using Whisper AI.
    Returns timestamped text segments.
    """
    if not whisper_service.is_loaded:
        raise HTTPException(
            503,
            "Whisper model not loaded. It may still be initializing.",
        )

    if not os.path.isfile(req.video_path):
        raise HTTPException(404, f"File not found: {req.video_path}")

    try:
        results = await whisper_service.transcribe(
            req.video_path,
            language=req.language,
        )

        segments = [
            SubtitleSegment(start=r.start, end=r.end, text=r.text)
            for r in results
        ]

        return GenerateResponse(
            success=True,
            segments=segments,
            total_segments=len(segments),
            language=req.language,
        )
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:
        raise HTTPException(500, f"Transcription error: {e}") from e


@router.post("/export", response_model=ExportResponse)
async def export_subtitles(req: ExportRequest):
    """
    Export subtitle segments to a file in SRT, VTT, or JSON format.
    """
    valid_formats = {"srt", "vtt", "json"}
    if req.format not in valid_formats:
        raise HTTPException(400, f"Invalid format. Must be one of: {valid_formats}")

    try:
        # Ensure output directory exists
        os.makedirs(os.path.dirname(req.output_path) or ".", exist_ok=True)

        if req.format == "srt":
            content = _segments_to_srt(req.segments)
            with open(req.output_path, "w", encoding="utf-8") as f:
                f.write(content)

        elif req.format == "vtt":
            content = _segments_to_vtt(req.segments)
            with open(req.output_path, "w", encoding="utf-8") as f:
                f.write(content)

        elif req.format == "json":
            import json

            data = [seg.model_dump() for seg in req.segments]
            with open(req.output_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

        return ExportResponse(
            success=True,
            message=f"Exported {len(req.segments)} segments as {req.format.upper()}",
            output_path=req.output_path,
        )
    except Exception as e:
        raise HTTPException(500, f"Export error: {e}") from e
