/**
 * Timeline Store — multi-track timeline state management.
 *
 * Manages tracks, clips, playhead, zoom, and selection.
 * Debounced auto-save to Supabase on every change.
 */

import { create } from 'zustand';
import { supabase } from '../api/supabaseClient';

// ── Types ────────────────────────────────────

export interface Clip {
  id: string;
  type: 'video' | 'audio' | 'subtitle';
  filePath: string;
  fileName: string;
  startTime: number;    // Position on timeline (seconds)
  duration: number;     // Clip duration (seconds)
  inPoint: number;      // Trim in point within source (seconds)
  outPoint: number;     // Trim out point within source (seconds)
  thumbnailUrl?: string;
  waveformData?: number[];
  text?: string;        // For subtitle clips
  effects?: {
    id: string;
    type: string;
    enabled: boolean;
    parameters: Record<string, any>;
  }[];
  volume?: number;
  muted?: boolean;
  speed?: number;
  reverse?: boolean;
  opacity?: number;
  blendMode?: string;
  posX?: number;
  posY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  cropLeft?: number;
  cropRight?: number;
  cropTop?: number;
  cropBottom?: number;
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'subtitle';
  label: string;
  clips: Clip[];
  locked: boolean;
  muted: boolean;
  visible: boolean;
}

interface TimelineState {
  tracks: Track[];
  playheadPosition: number;
  zoom: number;           // pixels per second
  selectedClipId: string | null;
  isPlaying: boolean;
  duration: number;       // Total timeline duration
  projectId: string | null;

  // Actions
  setProjectId: (id: string) => void;
  loadTimeline: (projectId: string) => Promise<void>;
  saveTimeline: () => Promise<void>;

  // Track actions
  addTrack: (type: 'video' | 'audio' | 'subtitle') => void;
  removeTrack: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;

  // Clip actions
  addClip: (trackId: string, clip: Clip) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, newStartTime: number) => void;
  splitClip: (clipId: string, atTime: number) => void;
  trimClip: (clipId: string, newInPoint: number, newOutPoint: number) => void;
  selectClip: (clipId: string | null) => void;
  getSelectedClip: () => Clip | null;

  // Sync / Real-time actions
  updateClip: (clipId: string, changes: Partial<Clip>) => void;
  addEffectToClip: (clipId: string, effect: any) => void;
  removeEffectFromClip: (clipId: string, effectType: string) => void;
  setTracks: (tracks: Track[], duration: number) => void;

  // Playback
  setPlayheadPosition: (position: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;

  // Undo / Redo
  undoStack: Track[][];
  redoStack: Track[][];
  pushUndo: (label?: string) => void;
  undo: () => void;
  redo: () => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function calcDuration(tracks: Track[]): number {
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > max) max = end;
    }
  }
  return max;
}

function debouncedSave(save: () => Promise<void>) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => save(), 2000);
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  tracks: [
    { id: 'video-1', type: 'video', label: 'Video 1', clips: [], locked: false, muted: false, visible: true },
    { id: 'audio-1', type: 'audio', label: 'Audio 1', clips: [], locked: false, muted: false, visible: true },
    { id: 'subtitle-1', type: 'subtitle', label: 'Subtitles', clips: [], locked: false, muted: false, visible: true },
  ],
  playheadPosition: 0,
  zoom: 100,
  selectedClipId: null,
  isPlaying: false,
  duration: 0,
  projectId: null,
  undoStack: [],
  redoStack: [],

  setProjectId: (id) => set({ projectId: id }),

  loadTimeline: async (projectId) => {
    const { data, error } = await supabase
      .from('project_timelines')
      .select('timeline_json')
      .eq('project_id', projectId)
      .single();

    if (error || !data) {
      console.error('Failed to load timeline:', error);
      return;
    }

    const json = data.timeline_json as { tracks?: Track[]; duration?: number; playhead?: number };
    set({
      projectId,
      tracks: json.tracks || get().tracks,
      duration: json.duration || 0,
      playheadPosition: json.playhead || 0,
    });
  },

  saveTimeline: async () => {
    const { tracks, duration, playheadPosition, projectId } = get();
    if (!projectId) return;

    const { error } = await supabase
      .from('project_timelines')
      .upsert({
        project_id: projectId,
        timeline_json: { tracks, duration, playhead: playheadPosition },
      }, { onConflict: 'project_id' });

    if (error) {
      console.error('Failed to save timeline:', error);
    }
  },

  // ── Track actions ──

  addTrack: (type) => {
    const { tracks, pushUndo, saveTimeline } = get();
    pushUndo(`Added ${type} Track`);
    const count = tracks.filter((t) => t.type === type).length + 1;
    const labels = { video: 'Video', audio: 'Audio', subtitle: 'Subtitles' };
    const newTrack: Track = {
      id: `${type}-${generateId()}`,
      type,
      label: `${labels[type]} ${count}`,
      clips: [],
      locked: false,
      muted: false,
      visible: true,
    };
    set({ tracks: [...tracks, newTrack] });
    debouncedSave(saveTimeline);
  },

  removeTrack: (trackId) => {
    const { pushUndo, saveTimeline } = get();
    pushUndo('Removed Track');
    set((state) => ({ tracks: state.tracks.filter((t) => t.id !== trackId) }));
    debouncedSave(saveTimeline);
  },

  toggleTrackLock: (trackId) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, locked: !t.locked } : t
      ),
    }));
  },

  toggleTrackMute: (trackId) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, muted: !t.muted } : t
      ),
    }));
  },

  toggleTrackVisibility: (trackId) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, visible: !t.visible } : t
      ),
    }));
  },

  // ── Clip actions ──

  addClip: (trackId, clip) => {
    const { pushUndo, saveTimeline } = get();
    pushUndo(`Added clip '${clip.fileName}'`);
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t
      ),
      duration: calcDuration(
        state.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t
        )
      ),
    }));
    debouncedSave(saveTimeline);
  },

  removeClip: (clipId) => {
    const { pushUndo, saveTimeline } = get();
    pushUndo('Deleted Clip');
    set((state) => {
      const newTracks = state.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      }));
      return {
        tracks: newTracks,
        duration: calcDuration(newTracks),
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
      };
    });
    debouncedSave(saveTimeline);
  },

  moveClip: (clipId, newStartTime) => {
    const { pushUndo, saveTimeline } = get();
    pushUndo('Moved Clip');
    set((state) => {
      const newTracks = state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, startTime: Math.max(0, newStartTime) } : c
        ),
      }));
      return { tracks: newTracks, duration: calcDuration(newTracks) };
    });
    debouncedSave(saveTimeline);
  },

  splitClip: (clipId, atTime) => {
    const { pushUndo, saveTimeline } = get();
    pushUndo('Split Clip');
    set((state) => {
      const newTracks = state.tracks.map((track) => {
        const clipIndex = track.clips.findIndex((c) => c.id === clipId);
        if (clipIndex === -1) return track;

        const clip = track.clips[clipIndex];
        const relativeTime = atTime - clip.startTime;

        if (relativeTime <= 0 || relativeTime >= clip.duration) return track;

        const clip1: Clip = {
          ...clip,
          id: generateId(),
          duration: relativeTime,
          outPoint: clip.inPoint + relativeTime,
        };

        const clip2: Clip = {
          ...clip,
          id: generateId(),
          startTime: atTime,
          duration: clip.duration - relativeTime,
          inPoint: clip.inPoint + relativeTime,
        };

        const newClips = [...track.clips];
        newClips.splice(clipIndex, 1, clip1, clip2);

        return { ...track, clips: newClips };
      });

      return { tracks: newTracks, duration: calcDuration(newTracks) };
    });
    debouncedSave(saveTimeline);
  },

  trimClip: (clipId, newInPoint, newOutPoint) => {
    const { pushUndo, saveTimeline } = get();
    pushUndo('Trimmed Clip');
    set((state) => {
      const newTracks = state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                inPoint: newInPoint,
                outPoint: newOutPoint,
                duration: newOutPoint - newInPoint,
              }
            : c
        ),
      }));
      return { tracks: newTracks, duration: calcDuration(newTracks) };
    });
    debouncedSave(saveTimeline);
  },

  selectClip: (clipId) => set({ selectedClipId: clipId }),

  getSelectedClip: () => {
    const { tracks, selectedClipId } = get();
    if (!selectedClipId) return null;
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  },

  // ── Sync / Real-time actions ──

  updateClip: (clipId, changes) => {
    const { saveTimeline } = get();
    set((state) => {
      const newTracks = state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, ...changes } : c
        ),
      }));
      return { tracks: newTracks, duration: calcDuration(newTracks) };
    });
    debouncedSave(saveTimeline);
  },

  addEffectToClip: (clipId, effect) => {
    const { saveTimeline } = get();
    set((state) => {
      const newTracks = state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId) {
            const effects = c.effects ? [...c.effects] : [];
            // Remove existing duplicate effect of same type
            const filtered = effects.filter((e) => e.type !== effect.type);
            filtered.push(effect);
            return { ...c, effects: filtered };
          }
          return c;
        }),
      }));
      return { tracks: newTracks };
    });
    debouncedSave(saveTimeline);
  },

  removeEffectFromClip: (clipId, effectType) => {
    const { saveTimeline } = get();
    set((state) => {
      const newTracks = state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && c.effects) {
            return {
              ...c,
              effects: effectType === 'all' ? [] : c.effects.filter((e) => e.type !== effectType)
            };
          }
          return c;
        }),
      }));
      return { tracks: newTracks };
    });
    debouncedSave(saveTimeline);
  },

  setTracks: (tracks, duration) => {
    set({ tracks, duration });
  },

  // ── Playback ──

  setPlayheadPosition: (position) => set({ playheadPosition: Math.max(0, position) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setZoom: (zoom) => set({ zoom: Math.max(50, Math.min(400, zoom)) }),

  // ── Undo / Redo ──

  pushUndo: (label = 'Edited Timeline') => {
    const { tracks, undoStack } = get();
    set({
      undoStack: [...undoStack.slice(-50), JSON.parse(JSON.stringify(tracks))],
      redoStack: [],
    });
    (window as any).historyManager?.push(label);
  },

  undo: () => {
    const { undoStack, tracks, saveTimeline } = get();
    if (undoStack.length === 0) return;

    const previous = undoStack[undoStack.length - 1];
    set({
      tracks: previous,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, JSON.parse(JSON.stringify(tracks))],
      duration: calcDuration(previous),
    });
    debouncedSave(saveTimeline);
  },

  redo: () => {
    const { redoStack, tracks, saveTimeline } = get();
    if (redoStack.length === 0) return;

    const next = redoStack[redoStack.length - 1];
    set({
      tracks: next,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, JSON.parse(JSON.stringify(tracks))],
      duration: calcDuration(next),
    });
    debouncedSave(saveTimeline);
  },
}));

(window as any).timelineStore = useTimelineStore;

