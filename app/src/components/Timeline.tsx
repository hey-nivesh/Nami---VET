import { useRef, useCallback, useEffect, useState } from 'react';
import {
  IconPlus,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconRepeat,
  IconHistory,
} from '@tabler/icons-react';
import { useTimelineStore, type Track, type Clip } from '../store/timelineStore';
import { historyManager } from '../engine/HistoryManager';
import './Timeline.css';

// ── TimeRuler ──────────────────────────────

function TimeRuler({ zoom, width }: { zoom: number; width: number }) {
  const totalWidth = Math.max(width, 3000);
  const tickInterval = zoom >= 200 ? 0.5 : 1;
  const ticks: { x: number; label: string; major: boolean }[] = [];

  for (let t = 0; t * zoom < totalWidth; t += tickInterval) {
    ticks.push({
      x: t * zoom,
      label: `${Math.floor(t)}s`,
      major: t % 1 === 0,
    });
  }

  return (
    <div className="timeline-ruler" style={{ width: totalWidth }}>
      <svg width={totalWidth} height={24}>
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={tick.x} y1={tick.major ? 12 : 16}
              x2={tick.x} y2={24}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={0.5}
            />
            {tick.major && (
              <text
                x={tick.x + 4}
                y={10}
                fill="rgba(255,255,255,0.35)"
                fontSize={11}
                fontFamily="'JetBrains Mono', monospace"
              >
                {tick.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── TrackGutter ────────────────────────────

function TrackGutter({ track }: { track: Track }) {
  const { toggleTrackLock, toggleTrackMute, toggleTrackVisibility } = useTimelineStore();

  return (
    <div className="track-gutter">
      <span className="track-gutter-label">{track.label}</span>
      <div className="track-gutter-controls">
        <button
          className={`track-gutter-btn ${track.locked ? 'active' : ''}`}
          onClick={() => toggleTrackLock(track.id)}
          title="Lock"
        >
          🔒
        </button>
        <button
          className={`track-gutter-btn ${track.muted ? 'active' : ''}`}
          onClick={() => toggleTrackMute(track.id)}
          title="Mute"
        >
          {track.muted ? '🔇' : '🔊'}
        </button>
        <button
          className={`track-gutter-btn ${!track.visible ? 'active' : ''}`}
          onClick={() => toggleTrackVisibility(track.id)}
          title="Visibility"
        >
          {track.visible ? '👁' : '👁‍🗨'}
        </button>
      </div>
    </div>
  );
}

// ── ClipBlock ──────────────────────────────

function ClipBlock({
  clip,
  zoom,
  isSelected,
  onSelect,
  onMove,
  onContextMenu,
}: {
  clip: Clip;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (newStart: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, startTime: 0 });

  const left = clip.startTime * zoom;
  const width = Math.max(clip.duration * zoom, 20);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, startTime: clip.startTime };

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartRef.current.x;
      const newStart = Math.max(0, dragStartRef.current.startTime + dx / zoom);
      onMove(newStart);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const clipClass = [
    'clip-block',
    `clip-${clip.type}`,
    isSelected && 'selected',
    isDragging && 'dragging',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={clipClass}
      style={{ left, width }}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}
    >
      <div className="clip-resize-handle left" />
      <div className="clip-content">
        <span className="clip-label">{clip.fileName}</span>
        <span className="clip-duration">
          {Math.floor(clip.duration / 60)}:{Math.floor(clip.duration % 60).toString().padStart(2, '0')}
        </span>
      </div>

      {/* Audio waveform */}
      {clip.type === 'audio' && (
        <WaveformBar data={clip.waveformData || []} />
      )}

      {/* Subtitle pattern */}
      {clip.type === 'subtitle' && (
        <div className="clip-subtitle-pattern" />
      )}

      <div className="clip-resize-handle right" />
    </div>
  );
}

// ── Waveform bars for audio clips ──

function WaveformBar({ data }: { data: number[] }) {
  const displayData = data.length > 0 ? data : Array.from({ length: 60 }, () => Math.random() * 0.4 + 0.1);

  return (
    <div className="clip-waveform">
      {displayData.slice(0, 80).map((amp, i) => (
        <div
          key={i}
          className="waveform-bar"
          style={{ height: `${Math.max(amp * 100, 5)}%` }}
        />
      ))}
    </div>
  );
}

// ── Playhead ───────────────────────────────

function Playhead({
  position,
  zoom,
  height,
  onDrag,
}: {
  position: number;
  zoom: number;
  height: number;
  onDrag: (newPos: number) => void;
}) {
  const left = position * zoom;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startPos = position;

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      onDrag(Math.max(0, startPos + dx / zoom));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="playhead" style={{ left, height }}>
      <div className="playhead-handle" onMouseDown={handleMouseDown} />
      <div className="playhead-line" />
    </div>
  );
}

// ── Context Menu ───────────────────────────

function ClipContextMenu({
  x,
  y,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  const actions = ['Cut', 'Copy', 'Delete', 'Split here', 'Properties'];

  return (
    <div className="clip-context-menu" style={{ left: x, top: y }}>
      {actions.map((action) => (
        <button key={action} className="context-menu-item" onClick={() => onAction(action)}>
          {action}
        </button>
      ))}
    </div>
  );
}

// ── Main Timeline ──────────────────────────

export default function Timeline() {
  const {
    tracks,
    playheadPosition,
    zoom,
    selectedClipId,
    isPlaying,
    duration,
    addTrack,
    selectClip,
    moveClip,
    removeClip,
    splitClip,
    setPlayheadPosition,
    setIsPlaying,
    setZoom,
  } = useTimelineStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    clipId: string;
  } | null>(null);

  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [historyList, setHistoryList] = useState(historyManager.getHistoryList());

  useEffect(() => {
    const unsubscribe = historyManager.subscribe(() => {
      setHistoryList(historyManager.getHistoryList());
    });
    return () => unsubscribe();
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const totalWidth = Math.max((duration + 10) * zoom, 3000);
  const trackAreaHeight = tracks.length * 56;

  // Zoom with Ctrl+Scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -15 : 15;
        setZoom(zoom + delta);
      }
    },
    [zoom, setZoom]
  );

  // Click on ruler to set playhead
  const handleRulerClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    setPlayheadPosition(x / zoom);
  };

  // Handle context menu actions
  const handleContextAction = (action: string) => {
    if (!contextMenu) return;
    const { clipId } = contextMenu;

    switch (action) {
      case 'Delete':
        removeClip(clipId);
        break;
      case 'Split here':
        splitClip(clipId, playheadPosition);
        break;
    }
    setContextMenu(null);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  return (
    <div className="timeline" onWheel={handleWheel}>
      {/* Toolbar */}
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-left">
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }}
            onClick={() => addTrack('video')}>
            <IconPlus size={14} /> Add Track
          </button>
        </div>
        <div className="timeline-toolbar-center">
          <button className="btn-icon"><IconRepeat size={16} /></button>
          <button className="btn-icon" onClick={() => setPlayheadPosition(Math.max(0, playheadPosition - 5))}>
            <IconPlayerSkipBack size={16} />
          </button>
          <button className="btn-icon" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
          </button>
          <button className="btn-icon" onClick={() => setPlayheadPosition(playheadPosition + 5)}>
            <IconPlayerSkipForward size={16} />
          </button>
        </div>
        <div className="timeline-toolbar-right">
          <span className="timecode" style={{ fontSize: 11 }}>
            Zoom: {Math.round(zoom)}px/s
          </span>
          <button
            className={`btn-icon ${showHistoryPanel ? 'active' : ''}`}
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            title="Open History (Ctrl+H)"
            style={{ marginLeft: 6 }}
          >
            <IconHistory size={16} />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="timeline-body">
        {/* Left gutter column */}
        <div className="timeline-gutters">
          <div className="timeline-ruler-gutter" />
          {tracks.map((track) => (
            <TrackGutter key={track.id} track={track} />
          ))}
        </div>

        {/* Scrollable track area */}
        <div
          className="timeline-scroll-area"
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          {/* Ruler */}
          <div className="timeline-ruler-row" onClick={handleRulerClick}>
            <TimeRuler zoom={zoom} width={totalWidth} />
          </div>

          {/* Tracks */}
          <div className="timeline-tracks" style={{ width: totalWidth, height: trackAreaHeight }}>
            {tracks.map((track, trackIndex) => (
              <div key={track.id} className="timeline-track" style={{ top: trackIndex * 56 }}>
                {track.clips.map((clip) => (
                  <ClipBlock
                    key={clip.id}
                    clip={clip}
                    zoom={zoom}
                    isSelected={selectedClipId === clip.id}
                    onSelect={() => selectClip(clip.id)}
                    onMove={(newStart) => moveClip(clip.id, newStart)}
                    onContextMenu={(e) => setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id })}
                  />
                ))}
              </div>
            ))}

            {/* Playhead */}
            <Playhead
              position={playheadPosition}
              zoom={zoom}
              height={trackAreaHeight}
              onDrag={setPlayheadPosition}
            />
          </div>
        </div>

        {/* Sliding History Panel */}
        {showHistoryPanel && (
          <div className="timeline-history-panel">
            <div className="history-panel-header">
              <span>Edit History</span>
              <button className="history-close-btn" onClick={() => setShowHistoryPanel(false)}>×</button>
            </div>
            <div className="history-panel-list">
              {historyList.map((item) => (
                <div
                  key={item.index}
                  className={`history-item ${item.active ? 'active' : ''}`}
                  onClick={() => historyManager.jumpTo(item.index)}
                >
                  <span className="history-indicator" />
                  <span className="history-label">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ClipContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
