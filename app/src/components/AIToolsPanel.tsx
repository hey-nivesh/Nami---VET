import { useState } from 'react';
import {
  IconSubtask,
  IconCut,
  IconWaveSine,
  IconRobot,
} from '@tabler/icons-react';
import { useTimelineStore, type Clip } from '../store/timelineStore';
import { subtitlesApi } from '../api/subtitlesApi';
import { audioApi } from '../api/audioApi';
import './AIToolsPanel.css';

interface AIToolsPanelProps {
  onOpenChat: () => void;
}

export default function AIToolsPanel({ onOpenChat }: AIToolsPanelProps) {
  const { getSelectedClip, tracks, addClip } = useTimelineStore();
  const [loadingTool, setLoadingTool] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const selectedClip = getSelectedClip();

  const handleAutoSubtitles = async () => {
    if (!selectedClip) {
      setResults((r) => ({ ...r, subtitles: '⚠ Select a video clip first' }));
      return;
    }

    setLoadingTool('subtitles');
    setResults((r) => ({ ...r, subtitles: '' }));

    try {
      const res = await subtitlesApi.generate(selectedClip.filePath);
      // Add subtitle clips to subtitle track
      const subtitleTrack = tracks.find((t) => t.type === 'subtitle');
      if (subtitleTrack) {
        for (const seg of res.segments) {
          const clip: Clip = {
            id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            type: 'subtitle',
            filePath: '',
            fileName: seg.text.substring(0, 30),
            startTime: seg.start,
            duration: seg.end - seg.start,
            inPoint: 0,
            outPoint: seg.end - seg.start,
            text: seg.text,
          };
          addClip(subtitleTrack.id, clip);
        }
      }
      setResults((r) => ({
        ...r,
        subtitles: `✓ Generated ${res.total_segments} subtitles`,
      }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        subtitles: `✗ ${e instanceof Error ? e.message : 'Failed'}`,
      }));
    } finally {
      setLoadingTool(null);
    }
  };

  const handleSmartCut = async () => {
    if (!selectedClip) {
      setResults((r) => ({ ...r, smartcut: '⚠ Select a video clip first' }));
      return;
    }

    setLoadingTool('smartcut');
    try {
      const outputPath = selectedClip.filePath.replace(/(\.\w+)$/, '_smartcut$1');
      const res = await audioApi.smartCut(selectedClip.filePath, outputPath);
      setResults((r) => ({
        ...r,
        smartcut: `✓ Removed ${res.segments_removed} segments (saved ${res.time_saved_seconds.toFixed(1)}s)`,
      }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        smartcut: `✗ ${e instanceof Error ? e.message : 'Failed'}`,
      }));
    } finally {
      setLoadingTool(null);
    }
  };

  const handleRemoveSilence = async () => {
    if (!selectedClip) {
      setResults((r) => ({ ...r, silence: '⚠ Select a video clip first' }));
      return;
    }

    setLoadingTool('silence');
    try {
      const res = await audioApi.detectSilence(selectedClip.filePath);
      setResults((r) => ({
        ...r,
        silence: `✓ Found ${res.segments.length} silent segments (${res.total_silence_seconds.toFixed(1)}s total)`,
      }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        silence: `✗ ${e instanceof Error ? e.message : 'Failed'}`,
      }));
    } finally {
      setLoadingTool(null);
    }
  };

  const tools = [
    {
      id: 'subtitles',
      icon: IconSubtask,
      label: 'Auto Subtitles',
      onClick: handleAutoSubtitles,
      loadingText: 'Transcribing audio...',
    },
    {
      id: 'smartcut',
      icon: IconCut,
      label: 'Smart Cut',
      onClick: handleSmartCut,
      loadingText: 'Analyzing audio...',
    },
    {
      id: 'silence',
      icon: IconWaveSine,
      label: 'Remove Silence',
      onClick: handleRemoveSilence,
      loadingText: 'Detecting silence...',
    },
    {
      id: 'chat',
      icon: IconRobot,
      label: 'AI Chat',
      onClick: onOpenChat,
      loadingText: '',
    },
  ];

  return (
    <div className="ai-tools-panel">
      <div className="ai-tools-header">
        <h3>AI Tools</h3>
      </div>
      <div className="ai-tools-list">
        {tools.map((tool) => (
          <div key={tool.id}>
            <button
              className={`ai-tool-btn ${loadingTool === tool.id ? 'loading' : ''}`}
              onClick={tool.onClick}
              disabled={loadingTool !== null && loadingTool !== tool.id}
            >
              {loadingTool === tool.id ? (
                <span className="spinner sm" />
              ) : (
                <tool.icon size={16} stroke={1.5} />
              )}
              <span className="ai-tool-label">
                {loadingTool === tool.id ? tool.loadingText : tool.label}
              </span>
            </button>
            {results[tool.id] && (
              <div
                className={`ai-tool-result ${
                  results[tool.id].startsWith('✗') ? 'error' : 
                  results[tool.id].startsWith('⚠') ? 'warning' : 'success'
                }`}
              >
                {results[tool.id]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
