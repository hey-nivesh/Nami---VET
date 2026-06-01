import { SHORTCUTS_LIST } from '../engine/KeyboardShortcuts';
import './ShortcutsModal.css';

interface ShortcutsModalProps {
  onClose: () => void;
}

export default function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  // Group shortcuts by category
  const categories = {
    Playback: SHORTCUTS_LIST.filter((s) => s.category === 'Playback'),
    Editing: SHORTCUTS_LIST.filter((s) => s.category === 'Editing'),
    Timeline: SHORTCUTS_LIST.filter((s) => s.category === 'Timeline'),
    System: SHORTCUTS_LIST.filter((s) => s.category === 'System'),
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <h3>Keyboard Shortcuts Guide</h3>
          <button className="shortcuts-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="shortcuts-modal-body">
          {Object.entries(categories).map(([category, list]) => (
            <div key={category} className="shortcuts-category-section">
              <h4 className="shortcuts-category-title">{category}</h4>
              <div className="shortcuts-grid">
                {list.map((item, idx) => (
                  <div key={idx} className="shortcut-row">
                    <kbd className="shortcut-key">{item.key}</kbd>
                    <span className="shortcut-desc">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
