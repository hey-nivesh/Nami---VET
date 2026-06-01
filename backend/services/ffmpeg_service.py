"""
FFmpeg Service — async wrapper for FFmpeg operations.

Handles binary detection, command execution, progress parsing,
and path sanitization for security.
"""

import asyncio
import os
import re
import shutil
import subprocess
from pathlib import Path, PurePosixPath
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


class FFmpegError(Exception):
    """Raised when an FFmpeg command fails."""

    def __init__(self, message: str, stderr: str = "", return_code: int = -1):
        self.stderr = stderr
        self.return_code = return_code
        super().__init__(message)


class FFmpegService:
    """Async wrapper around the FFmpeg binary for video/audio operations."""

    def __init__(self):
        self._binary_path: Optional[str] = None

    def find_binary(self) -> str:
        """
        Detect ffmpeg binary. Search order:
        1. FFMPEG_PATH environment variable
        2. System PATH
        3. Bundled ./bin/ffmpeg.exe
        """
        # 1. Env var
        env_path = os.getenv("FFMPEG_PATH")
        if env_path and os.path.isfile(env_path):
            self._binary_path = env_path
            return self._binary_path

        # 2. System PATH
        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg:
            self._binary_path = system_ffmpeg
            return self._binary_path

        # 3. Bundled binary
        bundled = os.path.join(os.path.dirname(__file__), "..", "bin", "ffmpeg.exe")
        if os.path.isfile(bundled):
            self._binary_path = os.path.abspath(bundled)
            return self._binary_path

        raise FFmpegError(
            "FFmpeg binary not found. Set FFMPEG_PATH env var, "
            "add ffmpeg to PATH, or place ffmpeg.exe in backend/bin/"
        )

    @property
    def binary(self) -> str:
        if self._binary_path is None:
            self.find_binary()
        assert self._binary_path is not None
        return self._binary_path

    @staticmethod
    def sanitize_path(file_path: str) -> str:
        """
        Prevent path traversal attacks.
        Resolves the path and ensures no '..' components remain.
        If the file doesn't exist directly (common in browser environments where only 
        the basename is sent), searches common user folders and secondary drives.
        """
        # Block any path that tried to use '..' traversal
        if ".." in Path(file_path).parts:
            raise FFmpegError(f"Path traversal detected in: {file_path}")

        p = Path(file_path)
        if p.exists():
            return str(p.resolve())

        # Try to locate the file in common user directories
        basename = p.name
        home = Path.home()
        search_dirs = [
            home / "Downloads",
            home / "Videos",
            home / "Desktop",
            home / "Documents",
            home / "Pictures",
            Path.cwd(),
            Path.cwd().parent
        ]

        # 1. Search directly in common folders
        for d in search_dirs:
            if d.exists():
                direct = d / basename
                if direct.exists():
                    return str(direct.resolve())

        # 2. Search 1 level deep in common folders
        for d in search_dirs:
            if d.exists():
                try:
                    for sub in d.iterdir():
                        if sub.is_dir() and not sub.name.startswith('.'):
                            target = sub / basename
                            if target.exists():
                                return str(target.resolve())
                except Exception:
                    pass

        # 3. Search E:\ and D:\ drives (common on Windows)
        if os.name == 'nt':
            try:
                for drive_letter in ["E:/", "D:/"]:
                    drive = Path(drive_letter)
                    if drive.exists():
                        # Direct drive root check
                        direct = drive / basename
                        if direct.exists():
                            return str(direct.resolve())
                        # Typical media folder checks
                        for folder in ["Videos", "Downloads", "Desktop", "Documents"]:
                            sub = drive / folder
                            if sub.exists():
                                target = sub / basename
                                if target.exists():
                                    return str(target.resolve())
                                # Check 1 level deep in E:\Videos etc
                                for child in sub.iterdir():
                                    if child.is_dir() and not child.name.startswith('.'):
                                        target2 = child / basename
                                        if target2.exists():
                                            return str(target2.resolve())
            except Exception:
                pass

        # Fallback to the resolved path
        return str(p.resolve())

    def _run_command_sync(
        self,
        cmd: list[str],
        loop: Optional[asyncio.AbstractEventLoop],
        progress_queue: Optional[asyncio.Queue],
    ) -> str:
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            startupinfo=startupinfo,
        )

        stderr_lines: list[str] = []
        time_pattern = re.compile(r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})")

        assert process.stderr is not None
        for line_bytes in iter(process.stderr.readline, b""):
            line = line_bytes.decode("utf-8", errors="replace").strip()
            stderr_lines.append(line)

            if progress_queue is not None and loop is not None:
                match = time_pattern.search(line)
                if match:
                    h, m, s, cs = (int(x) for x in match.groups())
                    current_seconds = h * 3600 + m * 60 + s + cs / 100.0
                    loop.call_soon_threadsafe(progress_queue.put_nowait, current_seconds)

        stdout_bytes = process.stdout.read() if process.stdout else b""
        process.wait()

        stderr_full = "\n".join(stderr_lines)

        if process.returncode != 0:
            raise FFmpegError(
                f"FFmpeg exited with code {process.returncode}",
                stderr=stderr_full,
                return_code=process.returncode,
            )

        return stdout_bytes.decode("utf-8", errors="replace")

    async def run_command(
        self,
        args: list[str],
        progress_queue: Optional[asyncio.Queue] = None,
    ) -> str:
        """
        Run an FFmpeg command asynchronously.
        Parses progress from stderr and pushes to queue if provided.
        Returns stdout on success, raises FFmpegError on failure.
        """
        cmd = [self.binary] + args
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        return await asyncio.to_thread(
            self._run_command_sync,
            cmd,
            loop,
            progress_queue,
        )

    async def trim(
        self, input_path: str, output_path: str, start_time: float, end_time: float
    ) -> str:
        """Trim a video between start_time and end_time (seconds)."""
        inp = self.sanitize_path(input_path)
        out = self.sanitize_path(output_path)
        duration = end_time - start_time

        args = [
            "-y",
            "-ss", str(start_time),
            "-i", inp,
            "-t", str(duration),
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            out,
        ]
        return await self.run_command(args)

    async def concat(self, clip_paths: list[str], output_path: str) -> str:
        """Concatenate multiple clips into one output file."""
        import tempfile

        sanitized_paths = [self.sanitize_path(p) for p in clip_paths]
        out = self.sanitize_path(output_path)

        # Create a temporary file list for FFmpeg concat demuxer
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        ) as f:
            for p in sanitized_paths:
                f.write(f"file '{p}'\n")
            list_file = f.name

        try:
            args = [
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_file,
                "-c", "copy",
                out,
            ]
            return await self.run_command(args)
        finally:
            os.unlink(list_file)

    async def export_video(
        self,
        input_path: str,
        output_path: str,
        format: str = "mp4",
        resolution: Optional[str] = None,
        bitrate: Optional[str] = None,
        progress_queue: Optional[asyncio.Queue] = None,
    ) -> str:
        """Export/transcode a video with optional resolution and bitrate."""
        inp = self.sanitize_path(input_path)
        out = self.sanitize_path(output_path)

        args = ["-y", "-i", inp]

        if resolution:
            # e.g. "1920x1080" → scale filter
            w, h = resolution.split("x")
            args.extend(["-vf", f"scale={w}:{h}"])

        if bitrate:
            args.extend(["-b:v", bitrate])

        args.extend(["-f", format, out])
        return await self.run_command(args, progress_queue=progress_queue)

    def _get_thumbnail_sync(self, video_path: str, timestamp: float) -> bytes:
        inp = self.sanitize_path(video_path)
        cmd = [
            self.binary,
            "-ss", str(timestamp),
            "-i", inp,
            "-vframes", "1",
            "-f", "image2",
            "-c:v", "mjpeg",
            "-q:v", "5",
            "pipe:1",
        ]

        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        process = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            startupinfo=startupinfo,
        )

        if process.returncode != 0:
            raise FFmpegError(
                "Failed to extract thumbnail",
                stderr=process.stderr.decode("utf-8", errors="replace"),
                return_code=process.returncode or -1,
            )

        return process.stdout

    async def get_thumbnail(
        self, video_path: str, timestamp: float = 1.0
    ) -> bytes:
        """Extract a single frame as JPEG bytes at the given timestamp."""
        return await asyncio.to_thread(self._get_thumbnail_sync, video_path, timestamp)

    async def split(
        self, input_path: str, split_at_seconds: float, output_dir: str
    ) -> tuple[str, str]:
        """Split a video at a specific timestamp into two parts."""
        inp = self.sanitize_path(input_path)
        out_dir = self.sanitize_path(output_dir)
        os.makedirs(out_dir, exist_ok=True)

        base = Path(inp).stem
        ext = Path(inp).suffix
        part1 = os.path.join(out_dir, f"{base}_part1{ext}")
        part2 = os.path.join(out_dir, f"{base}_part2{ext}")

        # Part 1: from start to split point
        await self.run_command([
            "-y", "-i", inp,
            "-t", str(split_at_seconds),
            "-c", "copy", part1,
        ])

        # Part 2: from split point to end
        await self.run_command([
            "-y", "-ss", str(split_at_seconds),
            "-i", inp,
            "-c", "copy", part2,
        ])

        return part1, part2

    async def extract_audio_wav(self, video_path: str, output_path: str) -> str:
        """Extract audio from video to a WAV file for processing."""
        inp = self.sanitize_path(video_path)
        out = self.sanitize_path(output_path)

        args = [
            "-y", "-i", inp,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            out,
        ]
        return await self.run_command(args)

    def _get_duration_sync(self, file_path: str) -> float:
        inp = self.sanitize_path(file_path)
        cmd = [
            self.binary,
            "-i", inp,
            "-f", "null", "-",
        ]

        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        process = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            startupinfo=startupinfo,
        )

        stderr_text = process.stderr.decode("utf-8", errors="replace")

        duration_match = re.search(
            r"Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})", stderr_text
        )
        if duration_match:
            h, m, s, cs = (int(x) for x in duration_match.groups())
            return h * 3600 + m * 60 + s + cs / 100.0

        return 0.0

    async def get_duration(self, file_path: str) -> float:
        """Get the duration of a media file in seconds."""
        return await asyncio.to_thread(self._get_duration_sync, file_path)

    def _get_media_info_sync(self, file_path: str) -> dict:
        import json
        inp = self.sanitize_path(file_path)
        ffprobe = self.binary.replace("ffmpeg", "ffprobe")
        if not shutil.which(ffprobe) and not os.path.isfile(ffprobe):
            ffprobe = shutil.which("ffprobe") or ffprobe

        cmd = [
            ffprobe,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            inp,
        ]

        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        process = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            startupinfo=startupinfo,
        )

        if process.returncode != 0:
            raise Exception("ffprobe failed")

        data = json.loads(process.stdout.decode("utf-8"))

        video_stream = next(
            (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
            None,
        )
        info: dict = {
            "duration": float(data.get("format", {}).get("duration", 0)),
            "width": 0,
            "height": 0,
            "fps": 0.0,
        }
        if video_stream:
            info["width"] = int(video_stream.get("width", 0))
            info["height"] = int(video_stream.get("height", 0))
            # Parse fps from r_frame_rate (e.g. "30/1")
            fps_str = video_stream.get("r_frame_rate", "0/1")
            if "/" in fps_str:
                num, den = fps_str.split("/")
                info["fps"] = float(num) / float(den) if float(den) > 0 else 0.0
            else:
                info["fps"] = float(fps_str)

        return info

    async def get_media_info(self, file_path: str) -> dict:
        """Get width, height, fps, and duration of a media file."""
        try:
            return await asyncio.to_thread(self._get_media_info_sync, file_path)
        except Exception:
            # Fallback: just get duration
            duration = await self.get_duration(file_path)
            return {"duration": duration, "width": 0, "height": 0, "fps": 0.0}


# Singleton instance
ffmpeg_service = FFmpegService()
