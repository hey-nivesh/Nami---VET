"""
Audio Router — REST endpoints for audio analysis and smart cutting.

Endpoints:
  POST /api/v1/audio/waveform
  POST /api/v1/audio/silence
  POST /api/v1/audio/smart-cut
"""

import asyncio
import os
import tempfile
from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.ffmpeg_service import FFmpegError, ffmpeg_service

router = APIRouter(prefix="/api/v1/audio", tags=["audio"])


# ── Pydantic Models ──────────────────────────────────────────

class WaveformRequest(BaseModel):
    video_path: str = Field(..., description="Path to video/audio file")
    num_points: int = Field(default=1000, ge=100, le=5000, description="Number of amplitude points")


class SilenceRequest(BaseModel):
    video_path: str = Field(..., description="Path to video/audio file")
    threshold_db: float = Field(default=-40.0, description="Silence threshold in dB")
    min_silence_ms: int = Field(default=500, ge=100, description="Minimum silence duration in ms")


class SmartCutRequest(BaseModel):
    video_path: str = Field(..., description="Path to source video")
    output_path: str = Field(..., description="Path for output video")
    threshold_db: float = Field(default=-40.0, description="Silence threshold in dB")
    min_silence_ms: int = Field(default=500, ge=100, description="Min silence duration in ms")
    padding_ms: int = Field(default=100, ge=0, description="Padding around speech in ms")


class SilenceSegment(BaseModel):
    start: float
    end: float


class WaveformResponse(BaseModel):
    success: bool
    amplitudes: list[float]
    duration: float


class SilenceResponse(BaseModel):
    success: bool
    segments: list[SilenceSegment]
    total_silence_seconds: float


class SmartCutResponse(BaseModel):
    success: bool
    message: str
    output_path: str
    segments_removed: int
    time_saved_seconds: float


# ── Helper functions ─────────────────────────────────────────

async def _extract_and_load_audio(
    video_path: str,
) -> tuple[np.ndarray, float]:
    """Extract audio from video and load as numpy array."""
    temp_wav = tempfile.mktemp(suffix=".wav")
    try:
        await ffmpeg_service.extract_audio_wav(video_path, temp_wav)

        # Load in thread pool to avoid blocking
        loop = asyncio.get_event_loop()

        def _load():
            import soundfile as sf
            data, sr = sf.read(temp_wav)
            return data, float(sr)

        data, sr = await loop.run_in_executor(None, _load)
        return np.array(data, dtype=np.float32), sr
    finally:
        if os.path.exists(temp_wav):
            os.unlink(temp_wav)


# ── Endpoints ────────────────────────────────────────────────

@router.post("/waveform", response_model=WaveformResponse)
async def get_waveform(req: WaveformRequest):
    """
    Generate waveform amplitude data for visualization.
    Returns normalized 0-1 amplitude values downsampled to num_points.
    """
    try:
        audio_data, sample_rate = await _extract_and_load_audio(req.video_path)

        # Downsample to requested number of points
        total_samples = len(audio_data)
        chunk_size = max(1, total_samples // req.num_points)
        amplitudes: list[float] = []

        for i in range(0, total_samples, chunk_size):
            chunk = audio_data[i : i + chunk_size]
            amp = float(np.abs(chunk).max())
            amplitudes.append(amp)

        # Limit to exactly num_points
        amplitudes = amplitudes[: req.num_points]

        # Normalize to 0-1
        max_amp = max(amplitudes) if amplitudes else 1.0
        if max_amp > 0:
            amplitudes = [a / max_amp for a in amplitudes]

        duration = total_samples / sample_rate

        return WaveformResponse(
            success=True,
            amplitudes=amplitudes,
            duration=duration,
        )
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg error: {e}") from e
    except Exception as e:
        raise HTTPException(500, f"Audio processing error: {e}") from e


@router.post("/silence", response_model=SilenceResponse)
async def detect_silence(req: SilenceRequest):
    """
    Detect silence segments in audio.
    Returns array of {start, end} time ranges where silence is detected.
    """
    try:
        audio_data, sample_rate = await _extract_and_load_audio(req.video_path)

        # Convert threshold from dB to linear amplitude
        threshold_linear = 10 ** (req.threshold_db / 20.0)
        min_silence_samples = int(req.min_silence_ms * sample_rate / 1000)

        # Find silence segments
        segments: list[SilenceSegment] = []
        is_silent = np.abs(audio_data) < threshold_linear
        silence_start: Optional[int] = None

        for i, silent in enumerate(is_silent):
            if silent and silence_start is None:
                silence_start = i
            elif not silent and silence_start is not None:
                duration_samples = i - silence_start
                if duration_samples >= min_silence_samples:
                    segments.append(
                        SilenceSegment(
                            start=round(silence_start / sample_rate, 3),
                            end=round(i / sample_rate, 3),
                        )
                    )
                silence_start = None

        # Handle trailing silence
        if silence_start is not None:
            duration_samples = len(audio_data) - silence_start
            if duration_samples >= min_silence_samples:
                segments.append(
                    SilenceSegment(
                        start=round(silence_start / sample_rate, 3),
                        end=round(len(audio_data) / sample_rate, 3),
                    )
                )

        total_silence = sum(s.end - s.start for s in segments)

        return SilenceResponse(
            success=True,
            segments=segments,
            total_silence_seconds=round(total_silence, 3),
        )
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg error: {e}") from e
    except Exception as e:
        raise HTTPException(500, f"Audio processing error: {e}") from e


@router.post("/smart-cut", response_model=SmartCutResponse)
async def smart_cut(req: SmartCutRequest):
    """
    Auto-remove silence segments from a video.
    Keeps speech sections with optional padding.
    """
    try:
        # First, detect silence
        audio_data, sample_rate = await _extract_and_load_audio(req.video_path)
        threshold_linear = 10 ** (req.threshold_db / 20.0)
        min_silence_samples = int(req.min_silence_ms * sample_rate / 1000)
        padding_seconds = req.padding_ms / 1000.0

        # Find silence segments
        is_silent = np.abs(audio_data) < threshold_linear
        silence_segments: list[tuple[float, float]] = []
        silence_start: Optional[int] = None

        for i, silent in enumerate(is_silent):
            if silent and silence_start is None:
                silence_start = i
            elif not silent and silence_start is not None:
                if i - silence_start >= min_silence_samples:
                    start_sec = silence_start / sample_rate
                    end_sec = i / sample_rate
                    silence_segments.append((start_sec, end_sec))
                silence_start = None

        if silence_start is not None and len(audio_data) - silence_start >= min_silence_samples:
            silence_segments.append(
                (silence_start / sample_rate, len(audio_data) / sample_rate)
            )

        if not silence_segments:
            return SmartCutResponse(
                success=True,
                message="No silence segments found",
                output_path=req.video_path,
                segments_removed=0,
                time_saved_seconds=0.0,
            )

        # Build speech segments (inverse of silence)
        total_duration = len(audio_data) / sample_rate
        speech_segments: list[tuple[float, float]] = []
        current = 0.0

        for sil_start, sil_end in silence_segments:
            if sil_start > current:
                speech_start = max(0, current - padding_seconds)
                speech_end = min(total_duration, sil_start + padding_seconds)
                speech_segments.append((speech_start, speech_end))
            current = sil_end

        if current < total_duration:
            speech_segments.append((max(0, current - padding_seconds), total_duration))

        # Trim and concatenate speech segments
        temp_clips: list[str] = []
        try:
            for i, (start, end) in enumerate(speech_segments):
                temp_path = tempfile.mktemp(suffix=f"_part{i}.mp4")
                await ffmpeg_service.trim(req.video_path, temp_path, start, end)
                temp_clips.append(temp_path)

            if len(temp_clips) == 1:
                # Just copy the single clip
                import shutil
                shutil.move(temp_clips[0], req.output_path)
                temp_clips.clear()
            elif len(temp_clips) > 1:
                await ffmpeg_service.concat(temp_clips, req.output_path)
        finally:
            for clip in temp_clips:
                if os.path.exists(clip):
                    os.unlink(clip)

        time_saved = sum(end - start for start, end in silence_segments)

        return SmartCutResponse(
            success=True,
            message=f"Removed {len(silence_segments)} silence segments",
            output_path=req.output_path,
            segments_removed=len(silence_segments),
            time_saved_seconds=round(time_saved, 2),
        )
    except FFmpegError as e:
        raise HTTPException(500, f"FFmpeg error: {e}") from e
    except Exception as e:
        raise HTTPException(500, f"Smart cut error: {e}") from e
