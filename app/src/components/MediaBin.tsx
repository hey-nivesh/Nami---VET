import { useRef, useCallback } from 'react';
import { IconPlus, IconDots, IconCheckbox } from '@tabler/icons-react';
import { useMediaStore, type MediaAsset } from '../store/mediaStore';
import { useTimelineStore } from '../store/timelineStore';
import './MediaBin.css';

interface MediaBinProps {
  projectId: string;
}

export default function MediaBin({ projectId }: MediaBinProps) {
  const { assets, importFile, getTotalSize, selectedAssetId, selectAsset } = useMediaStore();
  const { addClip, playheadPosition, tracks } = useTimelineStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const filePath = (files[i] as any).path || files[i].name;
      importFile(filePath, projectId);
    }
    e.target.value = '';
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        const filePath = (files[i] as any).path || files[i].name;
        importFile(filePath, projectId);
      }
    },
    [importFile, projectId]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDoubleClick = (asset: MediaAsset) => {
    if (asset.isLoading) return;

    // Find target track based on media type
    let targetTrackId = '';
    if (asset.media_type === 'video' || asset.media_type === 'image') {
      const videoTrack = tracks.find((t) => t.type === 'video');
      targetTrackId = videoTrack ? videoTrack.id : 'video-1';
    } else if (asset.media_type === 'audio') {
      const audioTrack = tracks.find((t) => t.type === 'audio');
      targetTrackId = audioTrack ? audioTrack.id : 'audio-1';
    } else if (asset.media_type === 'subtitle') {
      const subtitleTrack = tracks.find((t) => t.type === 'subtitle');
      targetTrackId = subtitleTrack ? subtitleTrack.id : 'subtitle-1';
    }

    if (!targetTrackId) return;

    // Add clip to the track at playhead position
    addClip(targetTrackId, {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: asset.media_type === 'image' ? 'video' : (asset.media_type as any),
      filePath: asset.file_path,
      fileName: asset.file_name,
      startTime: playheadPosition,
      duration: asset.duration_seconds || 5, // default to 5s for images
      inPoint: 0,
      outPoint: asset.duration_seconds || 5,
      thumbnailUrl: asset.thumbnail_url || undefined,
      isImage: asset.media_type === 'image',
    });
  };

  const handleSelectAsset = (asset: MediaAsset) => {
    selectAsset(asset.id);

    if (asset.isLoading) return;

    // Check if this asset is already in the timeline as a clip
    const isAlreadyInTimeline = tracks.some((t) =>
      t.clips.some((c) => c.filePath === asset.file_path)
    );

    if (isAlreadyInTimeline) {
      console.log(`[MediaBin] Asset '${asset.file_name}' is already in the timeline.`);
      return;
    }

    // Add clip to the track at playhead position automatically
    let targetTrackId = '';
    if (asset.media_type === 'video' || asset.media_type === 'image') {
      const videoTrack = tracks.find((t) => t.type === 'video');
      targetTrackId = videoTrack ? videoTrack.id : 'video-1';
    } else if (asset.media_type === 'audio') {
      const audioTrack = tracks.find((t) => t.type === 'audio');
      targetTrackId = audioTrack ? audioTrack.id : 'audio-1';
    } else if (asset.media_type === 'subtitle') {
      const subtitleTrack = tracks.find((t) => t.type === 'subtitle');
      targetTrackId = subtitleTrack ? subtitleTrack.id : 'subtitle-1';
    }

    if (!targetTrackId) return;

    addClip(targetTrackId, {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: asset.media_type === 'image' ? 'video' : (asset.media_type as any),
      filePath: asset.file_path,
      fileName: asset.file_name,
      startTime: playheadPosition,
      duration: asset.duration_seconds || 5, // default to 5s for images
      inPoint: 0,
      outPoint: asset.duration_seconds || 5,
      thumbnailUrl: asset.thumbnail_url || undefined,
      isImage: asset.media_type === 'image',
    });
  };

  return (
    <div className="media-bin" onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Header */}
      <div className="panel-header">
        <h3>Media</h3>
        <button className="btn-icon" onClick={handleImportClick} title="Import files">
          <IconPlus size={16} stroke={1.5} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      {/* Breadcrumb */}
      <div className="media-breadcrumb">
        File &gt; ... &gt; Media
      </div>

      {/* Grid */}
      <div className="media-grid">
        {assets.length === 0 ? (
          <div className="media-empty">
            <p>Drop files here or click + to import</p>
          </div>
        ) : (
          assets.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              isSelected={selectedAssetId === asset.id}
              onClick={() => handleSelectAsset(asset)}
              onDoubleClick={() => handleDoubleClick(asset)}
              formatDuration={formatDuration}
            />
          ))
        )}
      </div>

      {/* Bottom bar */}
      <div className="media-bottom">
        <IconCheckbox size={14} stroke={1.5} />
        <span>{assets.length} items</span>
        <span className="text-muted">{getTotalSize()}</span>
        <button className="btn-icon" style={{ marginLeft: 'auto' }}>
          <IconDots size={14} stroke={1.5} />
        </button>
      </div>
    </div>
  );
}

function MediaCard({
  asset,
  isSelected,
  onClick,
  onDoubleClick,
  formatDuration,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  formatDuration: (s: number) => string;
}) {
  return (
    <div 
      className={`media-card ${asset.isLoading ? 'loading' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable={!asset.isLoading}
      onDragStart={(e) => {
        e.dataTransfer.setData('assetId', asset.id);
      }}
    >
      <div className="media-card-thumb">
        {asset.isLoading ? (
          <div className="spinner" />
        ) : asset.thumbnail_url ? (
          <img src={asset.thumbnail_url} alt={asset.file_name} />
        ) : (
          <div className="media-card-placeholder">
            {asset.media_type === 'audio' ? '♪' : '▶'}
          </div>
        )}
      </div>
      <div className="media-card-info">
        <span className="media-card-name">{asset.file_name}</span>
        <span className="media-card-duration">
          {formatDuration(asset.duration_seconds || 0)}
        </span>
      </div>
    </div>
  );
}
