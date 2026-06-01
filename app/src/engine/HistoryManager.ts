/**
 * History Manager — Unified multi-level Undo/Redo command stack.
 *
 * Implements snapshot-based command pattern tracking tracks, duration,
 * and human-readable action labels up to 100 entries.
 */

import { useTimelineStore } from '../store/timelineStore';
import type { Track } from '../store/timelineStore';

export interface HistoryState {
  tracks: Track[];
  label: string;
  duration: number;
}

class HistoryManager {
  private past: HistoryState[] = [];
  private future: HistoryState[] = [];
  private limit = 100;

  // Listeners for UI state updates
  private listeners: (() => void)[] = [];

  constructor() {
    // Listen for timeline store loading changes to register initial state
    setTimeout(() => {
      const store = useTimelineStore.getState();
      this.past.push({
        tracks: JSON.parse(JSON.stringify(store.tracks)),
        label: 'Initial State',
        duration: store.duration,
      });
      this.notify();
    }, 1000);
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  /**
   * Capture a new state snapshot with a descriptive label.
   */
  push(label: string) {
    const store = useTimelineStore.getState();
    const tracksSnapshot = JSON.parse(JSON.stringify(store.tracks));

    this.past.push({
      tracks: tracksSnapshot,
      label,
      duration: store.duration,
    });

    // Clear redo history when a new action is performed
    this.future = [];

    if (this.past.length > this.limit) {
      this.past.shift();
    }

    this.notify();
    console.log(`[History] Pushed: "${label}". Stack size: ${this.past.length}`);
  }

  /**
   * Retrieve all logged items (past + future) for history panel display.
   */
  getHistoryList(): { label: string; active: boolean; index: number }[] {
    const list: { label: string; active: boolean; index: number }[] = [];
    
    this.past.forEach((state, idx) => {
      list.push({
        label: state.label,
        active: idx === this.past.length - 1,
        index: idx,
      });
    });

    this.future.forEach((state, idx) => {
      list.push({
        label: state.label,
        active: false,
        index: this.past.length + idx,
      });
    });

    return list;
  }

  /**
   * Multi-level jump to a specific history position.
   */
  jumpTo(index: number) {
    const allStates = [...this.past, ...this.future];
    if (index < 0 || index >= allStates.length) return;

    const newPast = allStates.slice(0, index + 1);
    const newFuture = allStates.slice(index + 1);

    this.past = newPast;
    this.future = newFuture;

    const targetState = this.past[this.past.length - 1];
    if (targetState) {
      const store = useTimelineStore.getState();
      store.setTracks(
        JSON.parse(JSON.stringify(targetState.tracks)),
        targetState.duration
      );
      store.saveTimeline();
    }

    this.notify();
    console.log(`[History] Jumped to index ${index}: "${targetState?.label}"`);
  }

  undo() {
    if (this.past.length <= 1) return; // Keep initial state

    const current = this.past.pop()!;
    this.future.unshift(current);

    const targetState = this.past[this.past.length - 1];
    if (targetState) {
      const store = useTimelineStore.getState();
      store.setTracks(
        JSON.parse(JSON.stringify(targetState.tracks)),
        targetState.duration
      );
      store.saveTimeline();
    }

    this.notify();
  }

  redo() {
    if (this.future.length === 0) return;

    const next = this.future.shift()!;
    this.past.push(next);

    const store = useTimelineStore.getState();
    store.setTracks(
      JSON.parse(JSON.stringify(next.tracks)),
      next.duration
    );
    store.saveTimeline();

    this.notify();
  }

  canUndo(): boolean {
    return this.past.length > 1;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }
}

export const historyManager = new HistoryManager();
(window as any).historyManager = historyManager;
export default historyManager;
