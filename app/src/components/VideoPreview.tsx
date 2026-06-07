import { useRef, useEffect, useState, useCallback } from 'react';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconMaximize,
  IconMinimize,
} from '@tabler/icons-react';
import { useTimelineStore, type Clip, type Track } from '../store/timelineStore';
import { useMediaStore } from '../store/mediaStore';
import { FilterEngine } from '../engine/FilterEngine';
import './VideoPreview.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function getStreamUrl(filePath: string) {
  return `${BACKEND_URL}/api/v1/video/stream?path=${encodeURIComponent(filePath)}`;
}

// ── Media element pool ─────────────────────────────────────────────────────────
// We keep one <video> or <img> element per unique filePath to avoid re-loading.
const videoPool = new Map<string, HTMLVideoElement>();
const imagePool = new Map<string, HTMLImageElement>();

function getOrCreateVideo(filePath: string): HTMLVideoElement {
  if (!videoPool.has(filePath)) {
    const v = document.createElement('video');
    v.src = getStreamUrl(filePath);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    document.body.appendChild(v); // Must be in DOM for decode to work
    v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    videoPool.set(filePath, v);
  }
  return videoPool.get(filePath)!;
}

function getOrCreateImage(filePath: string): HTMLImageElement {
  if (!imagePool.has(filePath)) {
    const img = new Image();
    img.src = getStreamUrl(filePath);
    img.crossOrigin = 'anonymous';
    imagePool.set(filePath, img);
  }
  return imagePool.get(filePath)!;
}

// ── Helper functions for active clips (defined outside component for clean ref access) ──

function isImageClip(clip: Clip): boolean {
  if (clip.isImage) return true;
  if (!clip.filePath) return false;
  const ext = clip.filePath.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext);
}

function getActiveVideoClips(tracks: Track[], playhead: number): Clip[] {
  const active: { clip: Clip; trackIndex: number; clipIndex: number }[] = [];
  tracks.forEach((track, trackIndex) => {
    if (track.type !== 'video' || !track.visible) return;
    track.clips.forEach((clip, clipIndex) => {
      if (playhead >= clip.startTime && playhead < clip.startTime + clip.duration) {
        active.push({ clip, trackIndex, clipIndex });
      }
    });
  });

  // Sort: bottom layer first, top layer last
  active.sort((a, b) => {
    const az = a.clip.zIndex ?? 0;
    const bz = b.clip.zIndex ?? 0;
    if (az !== bz) return az - bz;
    if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
    return a.clipIndex - b.clipIndex;
  });

  return active.map((item) => item.clip);
}

function getActivePlaybackClips(tracks: Track[], playhead: number): Clip[] {
  const active: Clip[] = [];
  for (const track of tracks) {
    if (track.type !== 'video' && track.type !== 'audio') continue;
    for (const clip of track.clips) {
      if (playhead >= clip.startTime && playhead < clip.startTime + clip.duration) {
        if (track.type === 'video' && isImageClip(clip)) continue; // Images don't have audio/playback elements
        active.push(clip);
      }
    }
  }
  return active;
}

function getActiveSubtitle(tracks: Track[], playhead: number): Clip | null {
  for (const track of tracks) {
    if (track.type !== 'subtitle' || !track.visible) continue;
    for (const clip of track.clips) {
      if (playhead >= clip.startTime && playhead < clip.startTime + clip.duration) {
        return clip;
      }
    }
  }
  return null;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function VideoPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

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

  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Sync refs for the animation loop ──────────────────────────────────────
  const isPlayingRef = useRef(isPlaying);
  const playheadPositionRef = useRef(playheadPosition);
  const durationRef = useRef(duration);
  const playbackRateRef = useRef(playbackRate);
  const tracksRef = useRef(tracks);
  const selectedAssetRef = useRef(selectedAsset);
  const activeSubtitleRef = useRef<Clip | null>(null);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { playheadPositionRef.current = playheadPosition; }, [playheadPosition]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { selectedAssetRef.current = selectedAsset; }, [selectedAsset]);

  const [activeSubtitle, setActiveSubtitle] = useState<Clip | null>(null);

  // ── Canvas sizing — maintain 16:9, letterbox ──────────────────────────────
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const { width, height } = container.getBoundingClientRect();
      const targetAspect = 16 / 9;
      const containerAspect = width / height;
      if (containerAspect > targetAspect) {
        // Wider than 16:9 — pillarbox
        canvas.height = height;
        canvas.width = height * targetAspect;
      } else {
        // Taller — letterbox
        canvas.width = width;
        canvas.height = width / targetAspect;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Monitor Fullscreen Changes ────────────────────────────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // ── Unified Playback Clock & Sync Loop ──────────────────────────────────
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    // 1. Clear & paint black background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // 2. Playhead Clock Advancement
    let currentPlayhead = playheadPositionRef.current;
    const now = performance.now();
    const delta = (now - (lastTimeRef.current || now)) / 1000;
    lastTimeRef.current = now;

    if (isPlayingRef.current) {
      currentPlayhead = playheadPositionRef.current + delta * playbackRateRef.current;
      if (durationRef.current > 0 && currentPlayhead >= durationRef.current) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        currentPlayhead = durationRef.current;
      }
      playheadPositionRef.current = currentPlayhead;
      setPlayheadPosition(currentPlayhead);
    }

    const currentTracks = tracksRef.current;
    const currentSelectedAsset = selectedAssetRef.current;

    const activeClips = getActiveVideoClips(currentTracks, currentPlayhead);
    const activePlaybackClips = getActivePlaybackClips(currentTracks, currentPlayhead);

    // Sync subtitles
    const newSub = getActiveSubtitle(currentTracks, currentPlayhead);
    if (activeSubtitleRef.current?.id !== newSub?.id) {
      activeSubtitleRef.current = newSub;
      setActiveSubtitle(newSub);
    }

    // 3. Fallback: Preview selected asset from media bin
    if (activeClips.length === 0 && currentSelectedAsset) {
      if (currentSelectedAsset.media_type === 'video') {
        const vid = getOrCreateVideo(currentSelectedAsset.file_path);
        vid.playbackRate = playbackRateRef.current;
        vid.muted = false; // Unmute selected preview
        vid.volume = 1.0;
        if (isPlayingRef.current) {
          if (vid.paused && vid.readyState >= 2) vid.play().catch(() => {});
        } else {
          if (!vid.paused) vid.pause();
        }
        ctx.save();
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        try {
          if (vid.readyState >= 2) {
            ctx.drawImage(vid, 0, 0, W, H);
          }
        } catch { /* not ready */ }
        ctx.restore();
      } else if (currentSelectedAsset.media_type === 'image') {
        const img = getOrCreateImage(currentSelectedAsset.file_path);
        ctx.save();
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        try {
          if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, 0, 0, W, H);
          }
        } catch { /* not ready */ }
        ctx.restore();
      }

      // Pause all other elements in pool
      for (const [filePath, vid] of videoPool.entries()) {
        if (filePath !== currentSelectedAsset.file_path) {
          if (!vid.paused) vid.pause();
        }
      }
      return;
    }

    // 4. Sync Play/Pause/Seek/Volume for all active playback clips
    const activeFilePaths = new Set(activePlaybackClips.map((c) => c.filePath));

    for (const clip of activePlaybackClips) {
      const vid = getOrCreateVideo(clip.filePath);
      const track = currentTracks.find((t) => t.clips.some((c) => c.id === clip.id));

      const isMuted = track?.muted || clip.muted || false;
      const volume = (clip.volume !== undefined ? clip.volume : 100) / 100;

      vid.volume = volume;
      vid.muted = isMuted;
      vid.playbackRate = playbackRateRef.current * (clip.speed || 1);

      const offset = currentPlayhead - clip.startTime;
      const targetTime = (clip.inPoint || 0) + offset * (clip.speed || 1);
      const maxTime = clip.outPoint ?? (clip.inPoint + clip.duration);
      const clamped = Math.max(0, Math.min(targetTime, maxTime));

      if (isPlayingRef.current) {
        if (vid.paused && vid.readyState >= 2) {
          vid.play().catch(() => {});
        }
        // Sync check: only seek if we drift by more than 0.15s
        if (Math.abs(vid.currentTime - clamped) > 0.15) {
          vid.currentTime = clamped;
        }
      } else {
        if (!vid.paused) {
          vid.pause();
        }
        // When paused, seek closely to show exact frame
        if (Math.abs(vid.currentTime - clamped) > 0.05) {
          vid.currentTime = clamped;
        }
      }
    }

    // 5. Pause any elements in pool that are not active
    for (const [filePath, vid] of videoPool.entries()) {
      if (!activeFilePaths.has(filePath)) {
        if (!vid.paused) {
          vid.pause();
        }
      }
    }

    // 6. Draw all active visual clips from bottom to top
    for (const clip of activeClips) {
      if (isImageClip(clip)) {
        const img = getOrCreateImage(clip.filePath);
        if (img.complete && img.naturalWidth > 0) {
          FilterEngine.drawClip(ctx, img, clip, W, H);
        }
      } else {
        const vid = getOrCreateVideo(clip.filePath);
        if (vid.readyState >= 2) {
          FilterEngine.drawClip(ctx, vid, clip, W, H);
        }
      }
    }
  }, [setIsPlaying, setPlayheadPosition]);

  // ── Animation frame loop ──────────────────────────────────────────────────
  useEffect(() => {
    let running = true;
    lastTimeRef.current = performance.now();
    const loop = () => {
      if (!running) return;
      renderFrame();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [renderFrame]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = () => {
    lastTimeRef.current = performance.now();
    setIsPlaying(!isPlaying);
  };
  const skipToStart = () => {
    setPlayheadPosition(0);
    setIsPlaying(false);
  };
  const skipToEnd = () => {
    setPlayheadPosition(duration);
    setIsPlaying(false);
  };

  const toggleFullscreen = () => {
    const el = previewRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const formatTimecode = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  const currentTracks = tracks;
  const currentPlayhead = playheadPosition;
  const activeClips = getActiveVideoClips(currentTracks, currentPlayhead);
  const hasContent = activeClips.length > 0 || !!selectedAsset;
  const rates = [0.25, 0.5, 0.75, 1, 1.5, 2];

  return (
    <div className="video-preview" ref={previewRef}>
      {/* Canvas Area */}
      <div className="preview-canvas" ref={containerRef}>
        {hasContent ? (
          <canvas ref={canvasRef} className="preview-canvas-element" />
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

        <div className="preview-rate" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="preview-rate-select"
          >
            {rates.map((r) => (
              <option key={r} value={r}>{r}x</option>
            ))}
          </select>

          <button
            className="btn-icon"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <IconMinimize size={18} stroke={1.5} /> : <IconMaximize size={18} stroke={1.5} />}
          </button>
        </div>
      </div>
    </div>
  );
}
