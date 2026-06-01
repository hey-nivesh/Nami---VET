/**
 * Project Store — project CRUD and auto-save management.
 */

import { create } from 'zustand';
import { supabase } from '../api/supabaseClient';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number;
  resolution: string;
  fps: number;
  last_opened_at: string;
  created_at: string;
  updated_at: string;
}

interface ProjectState {
  currentProject: Project | null;
  projects: Project[];
  isLoading: boolean;
  isSaving: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';

  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<Project | null>;
  openProject: (id: string) => Promise<void>;
  saveProject: () => Promise<void>;
  renameProject: (name: string) => void;
  deleteProject: (id: string) => Promise<void>;
  setAutoSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  projects: [],
  isLoading: false,
  isSaving: false,
  autoSaveStatus: 'idle',

  loadProjects: async () => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('last_opened_at', { ascending: false });

    if (error) {
      console.error('Failed to load projects:', error);
      set({ isLoading: false });
      return;
    }

    set({ projects: data || [], isLoading: false });
  },

  createProject: async (name) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name })
      .select()
      .single();

    if (error) {
      console.error('Failed to create project:', error);
      return null;
    }

    // Also create the timeline entry
    await supabase.from('project_timelines').insert({
      project_id: data.id,
      timeline_json: { tracks: [], duration: 0, playhead: 0 },
    });

    set((state) => ({ projects: [data, ...state.projects] }));
    return data;
  },

  openProject: async (id) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Failed to open project:', error);
      set({ isLoading: false });
      return;
    }

    // Update last_opened_at
    await supabase
      .from('projects')
      .update({ last_opened_at: new Date().toISOString() })
      .eq('id', id);

    set({ currentProject: data, isLoading: false });
  },

  saveProject: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isSaving: true, autoSaveStatus: 'saving' });

    const { error } = await supabase
      .from('projects')
      .update({
        name: currentProject.name,
        description: currentProject.description,
        duration_seconds: currentProject.duration_seconds,
        resolution: currentProject.resolution,
        fps: currentProject.fps,
      })
      .eq('id', currentProject.id);

    if (error) {
      console.error('Failed to save project:', error);
      set({ isSaving: false, autoSaveStatus: 'error' });
      return;
    }

    set({ isSaving: false, autoSaveStatus: 'saved' });

    // Reset to idle after 2s
    setTimeout(() => set({ autoSaveStatus: 'idle' }), 2000);
  },

  renameProject: (name) => {
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, name }
        : null,
    }));
  },

  deleteProject: async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);

    if (error) {
      console.error('Failed to delete project:', error);
      return;
    }

    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }));
  },

  setAutoSaveStatus: (status) => set({ autoSaveStatus: status }),
}));
