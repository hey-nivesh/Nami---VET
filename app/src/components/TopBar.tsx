import { useState } from 'react';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCut,
  IconHandGrab,
  IconShare,
  IconMovie,
  IconDotsVertical,
} from '@tabler/icons-react';
import { useTimelineStore } from '../store/timelineStore';
import { useProjectStore } from '../store/projectStore';
import { useAuthStore } from '../store/authStore';
import ExportModal from './ExportModal';
import ProjectSettingsModal from './ProjectSettingsModal';
import './TopBar.css';

export default function TopBar() {
  const { undo, redo, undoStack, redoStack } = useTimelineStore();
  const { currentProject, renameProject, saveProject, autoSaveStatus } =
    useProjectStore();
  const { user, signOut } = useAuthStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [activeTool, setActiveTool] = useState<'select' | 'razor' | 'hand'>('select');
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleStartRename = () => {
    setEditName(currentProject?.name || 'Untitled Project');
    setIsEditing(true);
  };

  const handleFinishRename = () => {
    setIsEditing(false);
    if (editName.trim()) {
      renameProject(editName.trim());
      saveProject();
    }
  };

  const getAutoSaveLabel = () => {
    switch (autoSaveStatus) {
      case 'saving': return 'Saving...';
      case 'saved': return 'Saved';
      case 'error': return 'Save failed';
      default: return 'Auto Save';
    }
  };

  const avatarLetter = user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <header className="topbar">
      {/* ── Left ── */}
      <div className="topbar-left">
        <div className="topbar-logo" onClick={() => useProjectStore.setState({ currentProject: null })} style={{ cursor: 'pointer' }} title="Back to Dashboard">
          <IconMovie size={20} stroke={1.5} color="#FF8C00" />
        </div>

        {isEditing ? (
          <input
            className="topbar-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={(e) => e.key === 'Enter' && handleFinishRename()}
            autoFocus
          />
        ) : (
          <span className="topbar-project-name" onClick={handleStartRename}>
            {currentProject?.name || 'Untitled Project'}
          </span>
        )}

        <div className={`topbar-autosave ${autoSaveStatus}`}>
          <span className="topbar-autosave-dot" />
          <span className="topbar-autosave-text">{getAutoSaveLabel()}</span>
        </div>
      </div>

      {/* ── Center ── */}
      <div className="topbar-center">
        <button
          className="btn-icon"
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo (Ctrl+Z)"
        >
          <IconArrowBackUp size={18} stroke={1.5} />
        </button>
        <button
          className="btn-icon"
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo (Ctrl+Y)"
        >
          <IconArrowForwardUp size={18} stroke={1.5} />
        </button>

        <div className="topbar-separator" />

        <button
          className={`btn-icon ${activeTool === 'razor' ? 'active' : ''}`}
          onClick={() => setActiveTool(activeTool === 'razor' ? 'select' : 'razor')}
          title="Razor tool (C)"
        >
          <IconCut size={18} stroke={1.5} />
        </button>
        <button
          className={`btn-icon ${activeTool === 'hand' ? 'active' : ''}`}
          onClick={() => setActiveTool(activeTool === 'hand' ? 'select' : 'hand')}
          title="Hand tool (H)"
        >
          <IconHandGrab size={18} stroke={1.5} />
        </button>
      </div>

      {/* ── Right ── */}
      <div className="topbar-right">
        <button className="btn btn-outline btn-pill topbar-render-btn" onClick={() => setShowExport(true)}>
          Render
        </button>
        <button className="btn-icon" title="Share">
          <IconShare size={18} stroke={1.5} />
        </button>
        <button className="btn-icon" title="Project Settings" onClick={() => setShowSettings(true)}>
          <IconDotsVertical size={18} stroke={1.5} />
        </button>
        <div className="topbar-avatar" title={user?.email || 'User'} onClick={() => signOut()}>
          {avatarLetter}
        </div>
      </div>
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showSettings && <ProjectSettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  );
}
