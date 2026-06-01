import { useRef, useEffect, useState } from 'react';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
} from '@tabler/icons-react';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaStore } from '../store/mediaStore';
import { FilterEngine } from '../engine/FilterEngine';
import './VideoPreview.css';

export default function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    isPlaying,
    setIsPlaying,
    playheadPosition,
    setPlayheadPosition,
    tracks,
    duration,
  } = useTimelineStore();

  const [playbackRate, setPlaybackRate] = useState(1);
  const { assets, selectedAssetId } = useMediaStore();

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  // Find the currently active video clip at the playhead position
  const activeVideoClip = tracks
    .filter((t) => t.type === 'video')
    .flatMap((t) => t.clips)
    .find(
      (c) =>
        playheadPosition >= c.startTime &&
        playheadPosition < c.startTime + c.duration
    );

  // Find subtitle at playhead
  const activeSubtitle = tracks
    .filter((t) => t.type === 'subtitle')
    .flatMap((t) => t.clips)
    .find(
      (c) =>
        playheadPosition >= c.startTime &&
        playheadPosition < c.startTime + c.duration
    );

  const getVideoStreamUrl = (filePath: string) => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
    return `${backendUrl}/api/v1/video/stream?path=${encodeURIComponent(filePath)}`;
  };

  // Playback sync loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && activeVideoClip && !video.paused) {
        const elapsedSource = video.currentTime - (activeVideoClip.inPoint || 0);
        const elapsedTimeline = elapsedSource / (activeVideoClip.speed || 1);
        setPlayheadPosition(activeVideoClip.startTime + elapsedTimeline);
      } else {
        setPlayheadPosition(playheadPosition + 0.033 * playbackRate);
      }

      if (duration > 0 && playheadPosition >= duration) {
        setIsPlaying(false);
      }
    }, 33);

    return () => clearInterval(interval);
  }, [isPlaying, playheadPosition, playbackRate, duration, setPlayheadPosition, setIsPlaying, activeVideoClip]);

  // Sync play/pause states & playbackRate
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = playbackRate;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, playbackRate, activeVideoClip]);

  // Sync playhead scrubbing (only when not playing to avoid feedback loops)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoClip || isPlaying) return;

    const playheadOffset = playheadPosition - activeVideoClip.startTime;
    const targetTime = (activeVideoClip.inPoint || 0) + playheadOffset * (activeVideoClip.speed || 1);
    const maxTime = activeVideoClip.outPoint !== undefined ? activeVideoClip.outPoint : activeVideoClip.duration;
    
    if (Math.abs(video.currentTime - targetTime) > 0.15) {
      video.currentTime = Math.max(0, Math.min(targetTime, maxTime));
    }
  }, [playheadPosition, activeVideoClip, isPlaying]);

  // Seek video once when the active clip changes (e.g. playhead enters a new clip)
  const prevClipIdRef = useRef<string | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoClip) {
      prevClipIdRef.current = null;
      return;
    }

    if (activeVideoClip.id !== prevClipIdRef.current) {
      prevClipIdRef.current = activeVideoClip.id;
      const playheadOffset = playheadPosition - activeVideoClip.startTime;
      const targetTime = (activeVideoClip.inPoint || 0) + playheadOffset * (activeVideoClip.speed || 1);
      const maxTime = activeVideoClip.outPoint !== undefined ? activeVideoClip.outPoint : activeVideoClip.duration;
      video.currentTime = Math.max(0, Math.min(targetTime, maxTime));
    }
  }, [activeVideoClip, playheadPosition]);

  // Render loop to paint video frames on Canvas and apply visual filters
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const drawFrame = () => {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      
      // Apply active filters from timeline clip
      if (activeVideoClip?.effects) {
        FilterEngine.applyFilters(ctx, canvas.width, canvas.height, activeVideoClip.effects as any);
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };

    const renderLoop = () => {
      if (!video.paused && !video.ended) {
        drawFrame();
      }
      animId = requestAnimationFrame(renderLoop);
    };

    if (isPlaying) {
      animId = requestAnimationFrame(renderLoop);
    } else {
      // Just draw current single frame when seeked while paused
      video.addEventListener('seeked', drawFrame);
      video.addEventListener('loadeddata', drawFrame);
      drawFrame();
    }

    return () => {
      cancelAnimationFrame(animId);
      video.removeEventListener('seeked', drawFrame);
      video.removeEventListener('loadeddata', drawFrame);
    };
  }, [isPlaying, activeVideoClip]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const skipToStart = () => {
    setPlayheadPosition(0);
    setIsPlaying(false);
  };

  const skipToEnd = () => {
    setPlayheadPosition(duration);
    setIsPlaying(false);
  };

  const formatTimecode = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  const rates = [0.25, 0.5, 0.75, 1, 1.5, 2];

  return (
    <div className="video-preview">
      {/* Canvas Area */}
      <div className="preview-canvas">
        {activeVideoClip ? (
          <>
            <video
              ref={videoRef}
              style={{ display: 'none' }}
              src={getVideoStreamUrl(activeVideoClip.filePath)}
              muted
              playsInline
            />
            <canvas ref={canvasRef} className="preview-canvas-element" />
          </>
        ) : selectedAsset && (selectedAsset.media_type === 'video' || selectedAsset.media_type === 'image') ? (
          selectedAsset.media_type === 'video' ? (
            <>
              <video
                ref={videoRef}
                style={{ display: 'none' }}
                src={getVideoStreamUrl(selectedAsset.file_path)}
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="preview-canvas-element" />
            </>
          ) : (
            <img
              className="preview-image"
              src={getVideoStreamUrl(selectedAsset.file_path)}
              alt={selectedAsset.file_name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )
        ) : (
          <div className="preview-placeholder">
            <span>No video selected</span>
          </div>
        )}

        {/* Subtitle overlay */}
        {activeSubtitle?.text && (
          <div className="preview-subtitle">
            {activeSubtitle.text}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="preview-controls">
        <span className="timecode">{formatTimecode(playheadPosition)}</span>

        <div className="preview-transport">
          <button className="btn-icon" onClick={skipToStart} title="Skip to start">
            <IconPlayerSkipBack size={18} stroke={1.5} />
          </button>
          <button className="preview-play-btn" onClick={togglePlay} title="Play/Pause (Space)">
            {isPlaying ? (
              <IconPlayerPause size={22} stroke={1.5} />
            ) : (
              <IconPlayerPlay size={22} stroke={1.5} />
            )}
          </button>
          <button className="btn-icon" onClick={skipToEnd} title="Skip to end">
            <IconPlayerSkipForward size={18} stroke={1.5} />
          </button>
        </div>

        <div className="preview-rate">
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="preview-rate-select"
          >
            {rates.map((r) => (
              <option key={r} value={r}>{r}x</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
