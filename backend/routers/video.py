"""
Video Router — Upgraded with advanced FFmpeg media processing endpoints.
"""

import base64
import os
import tempfile
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from services.ffmpeg_service import FFmpegError, ffmpeg_service

router = APIRouter(prefix="/api/v1/video", tags=["video"])


# ── Pydantic Models ──────────────────────────────────────────

class TrimRequest(BaseModel):
    input_path: str = Field(..., description="Path to the source video file")
    output_path: str = Field(..., description="Path for the trimmed output")
    start_time: float = Field(..., ge=0, description="Start time in seconds")
    end_time: float = Field(..., gt=0, description="End time in seconds")


class ConcatRequest(BaseModel):
    clip_paths: list[str] = Field(..., min_length=2, description="Paths of clips to concatenate")
    output_path: str = Field(..., description="Output file path")


class ExportRequest(BaseModel):
    input_path: str = Field(..., description="Source video path")
    output_path: str = Field(..., description="Output file path")
    format: str = Field(default="mp4", description="Output format (mp4, mov, webm)")
    resolution: Optional[str] = Field(default=None, description="Output resolution e.g. 1920x1080")
    bitrate: Optional[str] = Field(default=None, description="Video bitrate e.g. 8M")


class SplitRequest(BaseModel):
    input_path: str = Field(..., description="Source video path")
    split_at_seconds: float = Field(..., gt=0, description="Split point in seconds")
    output_dir: str = Field(..., description="Directory for output parts")


class SpeedRequest(BaseModel):
    input_path: str
    output_path: str
    speed_factor: float = Field(..., ge=0.5, le=2.0)
    reverse: bool = False


class FreezeRequest(BaseModel):
    input_path: str
    output_path: str
    at_seconds: float
    duration_seconds: float


class TransitionRequest(BaseModel):
    clip_a_path: str
    clip_b_path: str
    output_path: str
    transition_type: str = "fade"  # fade, wipeleft, wiperight, zoomin
    duration_seconds: float = 0.5


class AddTextRequest(BaseModel):
    input_path: str
    output_path: str
    text: str
    start_time: float
    end_time: float
    position: str = "bottom_center"
    font_size: int = 48
    color: str = "white"
    animation: str = "none"


class OverlayImageRequest(BaseModel):
    input_path: str
    overlay_path: str
    output_path: str
    x: int = 10
    y: int = 10
    width: int = 100
    height: int = 100
    opacity: float = 1.0
    start_time: float = 0.0
    end_time: float = 10.0


class ColorGradeEffect(BaseModel):
    type: str  # brightness, contrast, saturation, warmth
    parameters: dict = {}


class ColorGradeRequest(BaseModel):
    input_path: str
    output_path: str
    effects_stack: List[ColorGradeEffect]


class SilenceRange(BaseModel):
    start: float
    end: float


class RemoveSilencesRequest(BaseModel):
    input_path: str
    output_path: str
    silence_segments: List[SilenceRange]


class ThumbnailStripRequest(BaseModel):
    video_path: str
    count: int = 10


class VideoOperationResponse(BaseModel):
    success: bool
    message: str
    output_path: Optional[str] = None
    data: Optional[dict] = None


# ── Base Endpoints ───────────────────────────────────────────

@router.post("/trim", response_model=VideoOperationResponse)
async def trim_video(req: TrimRequest):
    """Trim a video between start_time and end_time."""
    if req.end_time <= req.start_time:
        raise HTTPException(400, "end_time must be greater than start_time")

    try:
        await ffmpeg_service.trim(
            req.input_path, req.output_path, req.start_time, req.end_time
        )
        return VideoOperationResponse(
            success=True,
            message="Video trimmed successfully",
            output_path=req.output_path,
        )
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg error: {e}") from e


@router.post("/concat", response_model=VideoOperationResponse)
async def concat_videos(req: ConcatRequest):
    """Concatenate multiple video clips into one file."""
    try:
        await ffmpeg_service.concat(req.clip_paths, req.output_path)
        return VideoOperationResponse(
            success=True,
            message=f"Concatenated {len(req.clip_paths)} clips",
            output_path=req.output_path,
        )
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg error: {e}") from e


@router.post("/export", response_model=VideoOperationResponse)
async def export_video(req: ExportRequest):
    """Export/transcode a video with format, resolution, and bitrate options."""
    try:
        await ffmpeg_service.export_video(
            req.input_path,
            req.output_path,
            format=req.format,
            resolution=req.resolution,
            bitrate=req.bitrate,
        )
        return VideoOperationResponse(
            success=True,
            message="Video exported successfully",
            output_path=req.output_path,
        )
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg error: {e}") from e


@router.post("/split", response_model=VideoOperationResponse)
async def split_video(req: SplitRequest):
    """Split a video into two parts at the specified timestamp."""
    try:
        part1, part2 = await ffmpeg_service.split(
            req.input_path, req.split_at_seconds, req.output_dir
        )
        return VideoOperationResponse(
            success=True,
            message="Video split into 2 parts",
            data={"part1": part1, "part2": part2},
        )
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg error: {e}") from e


@router.get("/thumbnail")
async def get_thumbnail(
    path: str = Query(..., description="Path to video file"),
    timestamp: float = Query(default=1.0, ge=0, description="Timestamp in seconds"),
):
    """Extract a single frame as a base64-encoded JPEG thumbnail."""
    try:
        image_bytes = await ffmpeg_service.get_thumbnail(path, timestamp)
        b64 = base64.b64encode(image_bytes).decode("ascii")
        return {"success": True, "thumbnail": f"data:image/jpeg;base64,{b64}"}
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg error: {e}") from e


@router.get("/info", response_model=VideoOperationResponse)
async def get_video_info(
    path: str = Query(..., description="Path to video file"),
):
    """Get media info (duration, resolution, fps) for a video file."""
    try:
        info = await ffmpeg_service.get_media_info(path)
        return VideoOperationResponse(
            success=True,
            message="Media info retrieved",
            data=info,
        )
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg error: {e}") from e


@router.get("/stream")
async def stream_video(
    path: str = Query(..., description="Path to video file"),
):
    """Stream a video/media file locally, enabling range request/scrubbing support."""
    try:
        resolved_path = ffmpeg_service.sanitize_path(path)
        if not os.path.exists(resolved_path):
            raise HTTPException(404, f"File not found: {path}")
        
        import mimetypes
        mime_type, _ = mimetypes.guess_type(resolved_path)
        return FileResponse(resolved_path, media_type=mime_type or "application/octet-stream")
    except Exception as e:
        raise HTTPException(500, f"Error resolving path: {e}")


# ── Advanced FFmpeg Endpoints ─────────────────────────────────

@router.post("/speed", response_model=VideoOperationResponse)
async def set_speed(req: SpeedRequest):
    """Change playback speed and/or reverse video."""
    inp = ffmpeg_service.sanitize_path(req.input_path)
    out = ffmpeg_service.sanitize_path(req.output_path)
    
    # Calculate setpts factor
    pts_factor = 1.0 / req.speed_factor
    vf_filters = []
    af_filters = []
    
    if req.reverse:
        vf_filters.append("reverse")
        af_filters.append("areverse")
        
    vf_filters.append(f"setpts={pts_factor}*PTS")
    
    # atempo can only be between 0.5 and 2.0.
    af_filters.append(f"atempo={req.speed_factor}")
    
    vf = ",".join(vf_filters)
    af = ",".join(af_filters)
    
    args = ["-y", "-i", inp, "-vf", vf, "-af", af, out]
    try:
        await ffmpeg_service.run_command(args)
        return VideoOperationResponse(success=True, message=f"Speed adjusted to {req.speed_factor}x", output_path=out)
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg speed error: {e}")


@router.post("/freeze", response_model=VideoOperationResponse)
async def insert_freeze(req: FreezeRequest):
    """Insert a frozen frame at at_seconds for duration_seconds."""
    inp = ffmpeg_service.sanitize_path(req.input_path)
    out = ffmpeg_service.sanitize_path(req.output_path)
    
    temp_img = tempfile.mktemp(suffix=".png")
    temp_freeze = tempfile.mktemp(suffix=".mp4")
    temp_part1 = tempfile.mktemp(suffix=".mp4")
    temp_part2 = tempfile.mktemp(suffix=".mp4")
    
    try:
        # 1. Extract the frozen frame
        await ffmpeg_service.run_command(["-y", "-ss", str(req.at_seconds), "-i", inp, "-vframes", "1", temp_img])
        
        # 2. Make video from that frame
        await ffmpeg_service.run_command([
            "-y", "-loop", "1", "-i", temp_img, "-t", str(req.duration_seconds),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", temp_freeze
        ])
        
        # 3. Trim parts 1 and 2
        await ffmpeg_service.trim(inp, temp_part1, 0, req.at_seconds)
        
        duration = await ffmpeg_service.get_duration(inp)
        await ffmpeg_service.trim(inp, temp_part2, req.at_seconds, duration)
        
        # 4. Concatenate
        await ffmpeg_service.concat([temp_part1, temp_freeze, temp_part2], out)
        
        return VideoOperationResponse(success=True, message="Freeze frame inserted", output_path=out)
    except Exception as e:
        raise HTTPException(500, f"Freeze frame error: {e}")
    finally:
        for f in [temp_img, temp_freeze, temp_part1, temp_part2]:
            if os.path.exists(f):
                os.unlink(f)


@router.post("/transition", response_model=VideoOperationResponse)
async def add_transition(req: TransitionRequest):
    """Apply a smooth video crossfade transition between two clips."""
    clip_a = ffmpeg_service.sanitize_path(req.clip_a_path)
    clip_b = ffmpeg_service.sanitize_path(req.clip_b_path)
    out = ffmpeg_service.sanitize_path(req.output_path)
    
    dur_a = await ffmpeg_service.get_duration(clip_a)
    offset = max(0.1, dur_a - req.duration_seconds)
    
    # xfade transition filter
    trans = req.transition_type
    if trans == "crossfade":
        trans = "fade"
    
    filter_complex = f"[0:v][1:v]xfade=transition={trans}:duration={req.duration_seconds}:offset={offset}[v];[0:a][1:a]acrossfade=d={req.duration_seconds}[a]"
    args = [
        "-y", "-i", clip_a, "-i", clip_b,
        "-filter_complex", filter_complex,
        "-map", "[v]", "-map", "[a]",
        out
    ]
    try:
        await ffmpeg_service.run_command(args)
        return VideoOperationResponse(success=True, message="Transition applied", output_path=out)
    except FFmpegError as e:
        raise HTTPException(500, f"Transition error: {e}")


@router.post("/add_text", response_model=VideoOperationResponse)
async def add_text_overlay(req: AddTextRequest):
    """Render a text subtitle overlay directly inside the video stream."""
    inp = ffmpeg_service.sanitize_path(req.input_path)
    out = ffmpeg_service.sanitize_path(req.output_path)
    
    # Translate position
    pos_expr = "x=(w-text_w)/2:y=h-text_h-30"  # bottom_center default
    if req.position == "top_left":
        pos_expr = "x=20:y=20"
    elif req.position == "top_center":
        pos_expr = "x=(w-text_w)/2:y=20"
    elif req.position == "top_right":
        pos_expr = "x=w-text_w-20:y=20"
    elif req.position == "center":
        pos_expr = "x=(w-text_w)/2:y=(h-text_h)/2"
    elif req.position == "bottom_left":
        pos_expr = "x=20:y=h-text_h-20"
    elif req.position == "bottom_right":
        pos_expr = "x=w-text_w-20:y=h-text_h-20"
        
    filter_str = f"drawtext=text='{req.text}':fontsize={req.font_size}:fontcolor={req.color}:{pos_expr}:enable='between(t,{req.start_time},{req.end_time})'"
    
    args = ["-y", "-i", inp, "-vf", filter_str, "-c:a", "copy", out]
    try:
        await ffmpeg_service.run_command(args)
        return VideoOperationResponse(success=True, message="Text overlay added", output_path=out)
    except FFmpegError as e:
        raise HTTPException(500, f"Add text overlay error: {e}")


@router.post("/overlay_image", response_model=VideoOperationResponse)
async def overlay_image(req: OverlayImageRequest):
    """Overlay an image watermark or logo onto the video stream."""
    inp = ffmpeg_service.sanitize_path(req.input_path)
    overlay = ffmpeg_service.sanitize_path(req.overlay_path)
    out = ffmpeg_service.sanitize_path(req.output_path)
    
    filter_complex = f"[1:v]scale={req.width}:{req.height}[ovr];[0:v][ovr]overlay={req.x}:{req.y}:enable='between(t,{req.start_time},{req.end_time})'"
    args = [
        "-y", "-i", inp, "-i", overlay,
        "-filter_complex", filter_complex,
        "-c:a", "copy", out
    ]
    try:
        await ffmpeg_service.run_command(args)
        return VideoOperationResponse(success=True, message="Image overlay added", output_path=out)
    except FFmpegError as e:
        raise HTTPException(500, f"Overlay image error: {e}")


@router.post("/color_grade", response_model=VideoOperationResponse)
async def color_grade(req: ColorGradeRequest):
    """Build a chained -vf filter from the effects stack to transcode video colors."""
    inp = ffmpeg_service.sanitize_path(req.input_path)
    out = ffmpeg_service.sanitize_path(req.output_path)
    
    # Translate effects_stack into a single eq filter chain
    brightness = 0.0
    contrast = 1.0
    saturation = 1.0
    
    for eff in req.effects_stack:
        p = eff.parameters
        if eff.type == "brightness":
            val = p.get("amount", 100) / 100.0  # 1.0 = normal
            brightness = val - 1.0  # ffmpeg eq ranges -1.0 to 1.0, default 0
        elif eff.type == "contrast":
            contrast = p.get("amount", 100) / 100.0  # ranges -1000 to 1000
        elif eff.type == "saturation":
            saturation = p.get("amount", 100) / 100.0  # ranges 0 to 10
            
    filter_str = f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}"
    args = ["-y", "-i", inp, "-vf", filter_str, "-c:a", "copy", out]
    try:
        await ffmpeg_service.run_command(args)
        return VideoOperationResponse(success=True, message="Color grading applied", output_path=out)
    except FFmpegError as e:
        raise HTTPException(500, f"Color grade error: {e}")


@router.post("/remove_silences", response_model=VideoOperationResponse)
async def remove_silences(req: RemoveSilencesRequest):
    """Concatenate and cut silent sections from a video."""
    inp = ffmpeg_service.sanitize_path(req.input_path)
    out = ffmpeg_service.sanitize_path(req.output_path)
    
    if not req.silence_segments:
        return VideoOperationResponse(success=True, message="No silent segments provided", output_path=inp)
        
    temp_clips = []
    try:
        # Build speech segments (inverse of silence)
        dur = await ffmpeg_service.get_duration(inp)
        speech_segments = []
        current = 0.0
        
        for sil in req.silence_segments:
            if sil.start > current:
                speech_segments.append((current, sil.start))
            current = sil.end
            
        if current < dur:
            speech_segments.append((current, dur))
            
        # Trim and concat
        for idx, (start, end) in enumerate(speech_segments):
            t_path = tempfile.mktemp(suffix=f"_speech{idx}.mp4")
            await ffmpeg_service.trim(inp, t_path, start, end)
            temp_clips.append(t_path)
            
        if temp_clips:
            await ffmpeg_service.concat(temp_clips, out)
            return VideoOperationResponse(success=True, message="Silence ranges removed", output_path=out)
            
        return VideoOperationResponse(success=False, message="No speech content remaining.")
    except Exception as e:
        raise HTTPException(500, f"Silence removal error: {e}")
    finally:
        for f in temp_clips:
            if os.path.exists(f):
                os.unlink(f)


@router.post("/thumbnail_strip")
async def get_thumbnail_strip(req: ThumbnailStripRequest):
    """Return an array of base64 JPEG strings evenly spaced across the video."""
    try:
        inp = ffmpeg_service.sanitize_path(req.video_path)
        duration = await ffmpeg_service.get_duration(inp)
        
        interval = duration / (req.count + 1)
        thumbnails = []
        
        for i in range(1, req.count + 1):
            ts = i * interval
            image_bytes = await ffmpeg_service.get_thumbnail(inp, ts)
            b64 = base64.b64encode(image_bytes).decode("ascii")
            thumbnails.append(f"data:image/jpeg;base64,{b64}")
            
        return {"success": True, "thumbnails": thumbnails}
    except Exception as e:
        raise HTTPException(500, f"Filmstrip error: {e}")
