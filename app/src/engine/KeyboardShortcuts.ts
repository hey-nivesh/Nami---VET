/**
 * Keyboard Shortcuts Manager — Global keyboard events router.
 *
 * Implements professional, state-level hotkeys for video playback,
 * timeline zooms, clips trims, razor splits, undo/redo, and reference modals.
 */

import { useTimelineStore } from '../store/timelineStore';
import { useProjectStore } from '../store/projectStore';

export interface ShortcutItem {
  key: string;
  description: string;
  category: 'Playback' | 'Editing' | 'Timeline' | 'System';
}

export const SHORTCUTS_LIST: ShortcutItem[] = [
  { key: 'Space', description: 'Play / Pause', category: 'Playback' },
  { key: 'K', description: 'Stop Playback', category: 'Playback' },
  { key: 'L', description: 'Fast Forward (1x, 2x, 4x)', category: 'Playback' },
  { key: 'J', description: 'Play Backward', category: 'Playback' },
  { key: 'Arrow Left / Right', description: 'Step 1 frame backward / forward', category: 'Playback' },
  { key: 'Shift+Left / Right', description: 'Step 10 frames backward / forward', category: 'Playback' },
  { key: 'I', description: 'Set Trim In Point at Playhead', category: 'Editing' },
  { key: 'O', description: 'Set Trim Out Point at Playhead', category: 'Editing' },
  { key: 'C', description: 'Razor / Cut Tool', category: 'Editing' },
  { key: 'V', description: 'Selection Tool', category: 'Editing' },
  { key: 'Delete / Backspace', description: 'Delete Selected Clip', category: 'Editing' },
  { key: '[', description: 'Trim In Point to Playhead', category: 'Editing' },
  { key: ']', description: 'Trim Out Point to Playhead', category: 'Editing' },
  { key: 'Ctrl+Z', description: 'Undo Last Action', category: 'System' },
  { key: 'Ctrl+Shift+Z / Ctrl+Y', description: 'Redo Action', category: 'System' },
  { key: 'Ctrl+S', description: 'Force Save Project', category: 'System' },
  { key: 'Ctrl+=', description: 'Zoom Timeline In', category: 'Timeline' },
  { key: 'Ctrl+-', description: 'Zoom Timeline Out', category: 'Timeline' },
  { key: 'Ctrl+0', description: 'Zoom to Fit Timeline', category: 'Timeline' },
  { key: 'Ctrl+/', description: 'Show Keyboard Shortcuts Guide', category: 'System' },
];

export function registerGlobalShortcuts(onShowHelp: () => void): () => void {
  const handler = (e: KeyboardEvent) => {
    // Avoid triggering hotkeys when typing in editable elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    const store = useTimelineStore.getState();
    const projStore = useProjectStore.getState();

    // ── System Category ──

    // Ctrl + / = Show Help Modal
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      onShowHelp();
      return;
    }

    // Ctrl + Z = Undo
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      store.undo();
      return;
    }

    // Ctrl + Shift + Z or Ctrl + Y = Redo
    if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
      e.preventDefault();
      store.redo();
      return;
    }

    // Ctrl + S = Save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      projStore.saveProject();
      return;
    }

    // ── Playback Category ──

    // Space = Play/Pause
    if (e.code === 'Space') {
      e.preventDefault();
      store.setIsPlaying(!store.isPlaying);
      return;
    }

    // K = Stop/Pause
    if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      store.setIsPlaying(false);
      return;
    }

    // Arrow Right = Step 1 frame forward (assume 30fps -> 0.033s)
    if (e.key === 'ArrowRight' && !e.shiftKey) {
      e.preventDefault();
      store.setPlayheadPosition(store.playheadPosition + 1 / 30);
      return;
    }

    // Arrow Left = Step 1 frame backward
    if (e.key === 'ArrowLeft' && !e.shiftKey) {
      e.preventDefault();
      store.setPlayheadPosition(store.playheadPosition - 1 / 30);
      return;
    }

    // Shift + Right = Step 10 frames forward (0.33s)
    if (e.key === 'ArrowRight' && e.shiftKey) {
      e.preventDefault();
      store.setPlayheadPosition(store.playheadPosition + 10 / 30);
      return;
    }

    // Shift + Left = Step 10 frames backward
    if (e.key === 'ArrowLeft' && e.shiftKey) {
      e.preventDefault();
      store.setPlayheadPosition(store.playheadPosition - 10 / 30);
      return;
    }

    // ── Timeline Category ──

    // Ctrl + = = Zoom in
    if (e.ctrlKey && e.key === '=') {
      e.preventDefault();
      store.setZoom(store.zoom + 25);
      return;
    }

    // Ctrl + - = Zoom out
    if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      store.setZoom(store.zoom - 25);
      return;
    }

    // Ctrl + 0 = Zoom Fit (default 100px/s)
    if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      store.setZoom(100);
      return;
    }

    // ── Editing Category ──

    // Delete or Backspace = Delete selected clip
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedClipId) {
      e.preventDefault();
      store.removeClip(store.selectedClipId);
      return;
    }

    // [ = Trim clip in-point to playhead
    if (e.key === '[' && store.selectedClipId) {
      const clip = store.getSelectedClip();
      if (clip) {
        e.preventDefault();
        const diff = store.playheadPosition - clip.startTime;
        if (diff > 0 && diff < clip.duration) {
          store.trimClip(clip.id, clip.inPoint + diff, clip.outPoint);
          store.moveClip(clip.id, store.playheadPosition);
        }
      }
      return;
    }

    // ] = Trim clip out-point to playhead
    if (e.key === ']' && store.selectedClipId) {
      const clip = store.getSelectedClip();
      if (clip) {
        e.preventDefault();
        const diff = store.playheadPosition - clip.startTime;
        if (diff > 0 && diff < clip.duration) {
          store.trimClip(clip.id, clip.inPoint, clip.inPoint + diff);
        }
      }
      return;
    }

    // C = Set split/razor cut at playhead
    if (e.key.toLowerCase() === 'c' && store.selectedClipId) {
      const clip = store.getSelectedClip();
      if (clip) {
        e.preventDefault();
        store.splitClip(clip.id, store.playheadPosition);
      }
      return;
    }
  };

  window.addEventListener('keydown', handler);
  return () => {
    window.removeEventListener('keydown', handler);
  };
}
