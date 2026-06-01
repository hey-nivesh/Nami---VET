import { useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import './ProjectSettingsModal.css';

interface ProjectSettingsModalProps {
  onClose: () => void;
}

const RESOLUTIONS = [
  { value: '1920x1080', label: '1080p Landscape (1920x1080)' },
  { value: '1280x720', label: '720p HD (1280x720)' },
  { value: '3840x2160', label: '4K Ultra HD (3840x2160)' },
  { value: '1080x1920', label: '9:16 Portrait (1080x1920)' },
];

const FRAMERATES = [24, 25, 30, 60];
const SAMPLE_RATES = [44100, 48000];
const COLOR_SPACES = ['sRGB', 'Rec.709'];

export default function ProjectSettingsModal({ onClose }: ProjectSettingsModalProps) {
  const { currentProject, renameProject, saveProject } = useProjectStore();

  const [name, setName] = useState(currentProject?.name || '');
  const [resolution, setResolution] = useState(currentProject?.resolution || '1920x1080');
  const [fps, setFps] = useState(currentProject?.fps || 30);
  const [sampleRate, setSampleRate] = useState(48000);
  const [colorSpace, setColorSpace] = useState('Rec.709');

  const handleSave = async () => {
    if (!currentProject) return;

    // Mutate the active project values
    renameProject(name);
    
    // Update resolution and fps
    useProjectStore.setState({
      currentProject: {
        ...currentProject,
        name,
        resolution,
        fps,
      },
    });

    await saveProject();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h3>Project Settings</h3>
          <button className="settings-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-modal-body">
          {/* Project Name */}
          <div className="settings-form-group">
            <label>Project Name</label>
            <input
              className="input settings-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
            />
          </div>

          {/* Resolution */}
          <div className="settings-form-group">
            <label>Resolution</label>
            <select
              className="input settings-select"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            >
              {RESOLUTIONS.map((res) => (
                <option key={res.value} value={res.value}>
                  {res.label}
                </option>
              ))}
            </select>
          </div>

          {/* Frame Rate */}
          <div className="settings-form-group">
            <label>Frame Rate</label>
            <select
              className="input settings-select"
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
            >
              {FRAMERATES.map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </div>

          {/* Sample Rate */}
          <div className="settings-form-group">
            <label>Audio Sample Rate</label>
            <select
              className="input settings-select"
              value={sampleRate}
              onChange={(e) => setSampleRate(Number(e.target.value))}
            >
              {SAMPLE_RATES.map((s) => (
                <option key={s} value={s}>
                  {s} Hz
                </option>
              ))}
            </select>
          </div>

          {/* Color Space */}
          <div className="settings-form-group">
            <label>Color Space</label>
            <select
              className="input settings-select"
              value={colorSpace}
              onChange={(e) => setColorSpace(e.target.value)}
            >
              {COLOR_SPACES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
