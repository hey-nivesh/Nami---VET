"""
Whisper Service — local speech-to-text using faster-whisper.

Loads the model once as a singleton and provides a transcribe() method
that extracts audio to a temp WAV, runs Whisper, and returns segments.
"""

import os
import tempfile
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


@dataclass
class TranscriptSegment:
    """A single transcribed segment with timing and text."""
    start: float
    end: float
    text: str


class WhisperService:
    """Singleton wrapper around faster-whisper for local STT."""

    def __init__(self):
        self._model = None
        self._model_size: str = os.getenv("WHISPER_MODEL_SIZE", "tiny")

    def load_model(self) -> None:
        """
        Load the Whisper model. Called once at startup.
        Uses int8 quantization on CPU for speed.
        """
        try:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                self._model_size,
                device="cpu",
                compute_type="int8",
            )
            print(f"  ✓ Whisper model '{self._model_size}' loaded (CPU, int8)")
        except Exception as e:
            print(f"  ✗ Whisper model failed to load: {e}")
            self._model = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    async def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
    ) -> list[TranscriptSegment]:
        """
        Transcribe an audio/video file.
        If the input is a video, extracts audio to temp WAV first.
        Returns a list of TranscriptSegment objects.
        """
        if self._model is None:
            raise RuntimeError(
                "Whisper model not loaded. Call load_model() first."
            )

        import asyncio

        # If input is a video, extract audio first
        input_path = audio_path
        temp_wav: Optional[str] = None

        video_extensions = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv"}
        ext = os.path.splitext(audio_path)[1].lower()

        if ext in video_extensions:
            from services.ffmpeg_service import ffmpeg_service

            temp_wav = tempfile.mktemp(suffix=".wav")
            await ffmpeg_service.extract_audio_wav(audio_path, temp_wav)
            input_path = temp_wav

        try:
            # Run transcription in a thread pool to avoid blocking the event loop
            segments = await asyncio.get_event_loop().run_in_executor(
                None, self._run_transcription, input_path, language
            )
            return segments
        finally:
            # Clean up temp file
            if temp_wav and os.path.exists(temp_wav):
                os.unlink(temp_wav)

    def _run_transcription(
        self, audio_path: str, language: Optional[str]
    ) -> list[TranscriptSegment]:
        """Synchronous transcription — runs in thread pool."""
        assert self._model is not None

        kwargs = {}
        if language:
            kwargs["language"] = language

        segments_iter, _info = self._model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
            **kwargs,
        )

        results: list[TranscriptSegment] = []
        for segment in segments_iter:
            results.append(
                TranscriptSegment(
                    start=round(segment.start, 3),
                    end=round(segment.end, 3),
                    text=segment.text.strip(),
                )
            )

        return results


# Singleton instance
whisper_service = WhisperService()
