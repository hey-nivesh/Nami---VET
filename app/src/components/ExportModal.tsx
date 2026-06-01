import { useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { videoApi } from '../api/videoApi';
import { useTimelineStore } from '../store/timelineStore';
import './ExportModal.css';

interface ExportModalProps {
  onClose: () => void;
}

export default function ExportModal({ onClose }: ExportModalProps) {
  const { getSelectedClip } = useTimelineStore();

  const [format, setFormat] = useState('mp4');
  const [resolution, setResolution] = useState('1920x1080');
  const [quality, setQuality] = useState('high');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [error, setError] = useState('');

  const bitrateMap: Record<string, string> = {
    high: '12M',
    medium: '6M',
    web: '3M',
  };

  const resolutionLabels: Record<string, string> = {
    '3840x2160': '4K (3840×2160)',
    '1920x1080': '1080p (1920×1080)',
    '1280x720': '720p (1280×720)',
  };

  const handleExport = async () => {
    const clip = getSelectedClip();
    if (!clip) {
      setError('No clip selected for export');
      return;
    }

    setIsExporting(true);
    setProgress(0);
    setError('');

    const outPath = clip.filePath.replace(
      /(\.\w+)$/,
      `_export_${Date.now()}.${format}`
    );

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 8, 95));
    }, 500);

    try {
      await videoApi.exportVideo(
        clip.filePath,
        outPath,
        format,
        resolution,
        bitrateMap[quality]
      );
      clearInterval(progressInterval);
      setProgress(100);
      setOutputPath(outPath);
      setCompleted(true);
    } catch (e) {
      clearInterval(progressInterval);
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Render Project</h2>
          <button className="btn-icon" onClick={onClose}>
            <IconX size={18} />
          </button>
        </div>

        <div className="modal-body">
          {!isExporting && !completed ? (
            <>
              {/* Format */}
              <div className="export-field">
                <label className="export-label">Format</label>
                <div className="export-options">
                  {['mp4', 'mov', 'webm'].map((f) => (
                    <button
                      key={f}
                      className={`export-option ${format === f ? 'active' : ''}`}
                      onClick={() => setFormat(f)}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div className="export-field">
                <label className="export-label">Resolution</label>
                <select
                  className="property-select w-full"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  {Object.entries(resolutionLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Quality */}
              <div className="export-field">
                <label className="export-label">Quality</label>
                <div className="export-options">
                  {['high', 'medium', 'web'].map((q) => (
                    <button
                      key={q}
                      className={`export-option ${quality === q ? 'active' : ''}`}
                      onClick={() => setQuality(q)}
                    >
                      {q.charAt(0).toUpperCase() + q.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className="auth-error">{error}</div>}
            </>
          ) : completed ? (
            <div className="export-completed">
              <div className="export-check">✓</div>
              <p>Export complete!</p>
              <span className="text-muted text-sm">{outputPath}</span>
            </div>
          ) : (
            <div className="export-progress-section">
              <p>Rendering...</p>
              <div className="export-progress-bar">
                <div
                  className="export-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-muted text-sm">{Math.round(progress)}%</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isExporting && !completed && (
            <button className="btn btn-primary" onClick={handleExport}>
              Start Render
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            {completed ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
