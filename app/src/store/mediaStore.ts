/**
 * Media Store — imported media asset management.
 */

import { create } from 'zustand';
import { supabase } from '../api/supabaseClient';
import { videoApi } from '../api/videoApi';

export interface MediaAsset {
  id: string;
  project_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number;
  duration_seconds: number;
  width: number;
  height: number;
  fps: number;
  media_type: 'video' | 'audio' | 'image' | 'subtitle';
  thumbnail_url: string | null;
  created_at: string;
  isLoading?: boolean;
}

interface MediaState {
  assets: MediaAsset[];
  isLoading: boolean;
  selectedAssetId: string | null;

  loadAssets: (projectId: string) => Promise<void>;
  importFile: (filePath: string, projectId: string) => Promise<MediaAsset | null>;
  removeAsset: (id: string) => Promise<void>;
  getTotalSize: () => string;
  selectAsset: (id: string | null) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getMediaType(fileName: string): 'video' | 'audio' | 'image' | 'subtitle' {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) return 'image';
  if (['srt', 'vtt', 'ass', 'ssa'].includes(ext)) return 'subtitle';
  return 'video';
}

export const useMediaStore = create<MediaState>((set, get) => ({
  assets: [],
  isLoading: false,
  selectedAssetId: null,

  selectAsset: (id) => set({ selectedAssetId: id }),

  loadAssets: async (projectId) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('media_assets')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load media assets:', error);
      set({ isLoading: false });
      return;
    }

    set({ assets: data || [], isLoading: false });
  },

  importFile: async (filePath, projectId) => {
    const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
    const mediaType = getMediaType(fileName);

    // Create a placeholder asset with loading state
    const tempId = `temp-${Date.now()}`;
    const placeholder: MediaAsset = {
      id: tempId,
      project_id: projectId,
      user_id: '',
      file_name: fileName,
      file_path: filePath,
      file_size_bytes: 0,
      duration_seconds: 0,
      width: 0,
      height: 0,
      fps: 0,
      media_type: mediaType,
      thumbnail_url: null,
      created_at: new Date().toISOString(),
      isLoading: true,
    };

    set((state) => ({ assets: [placeholder, ...state.assets] }));

    try {
      // Get thumbnail and media info from backend
      let thumbnailUrl = null;
      let info = { duration: 0, width: 0, height: 0, fps: 0 };

      if (mediaType === 'video' || mediaType === 'audio') {
        try {
          const [thumbResult, infoResult] = await Promise.all([
            mediaType === 'video' ? videoApi.getThumbnail(filePath) : null,
            videoApi.getInfo(filePath),
          ]);
          if (thumbResult) thumbnailUrl = thumbResult.thumbnail;
          if (infoResult?.data) info = infoResult.data as typeof info;
        } catch (e) {
          console.warn('Failed to get media info:', e);
        }
      }

      // Save to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('media_assets')
        .insert({
          project_id: projectId,
          user_id: user.id,
          file_name: fileName,
          file_path: filePath,
          file_size_bytes: 0,
          duration_seconds: info.duration,
          width: info.width,
          height: info.height,
          fps: info.fps,
          media_type: mediaType,
          thumbnail_url: thumbnailUrl,
        })
        .select()
        .single();

      if (error) throw error;

      // Replace placeholder with real asset
      set((state) => ({
        assets: state.assets.map((a) =>
          a.id === tempId ? { ...data, isLoading: false } : a
        ),
      }));

      return data;
    } catch (e) {
      console.error('Failed to import file:', e);
      // Remove the placeholder on error
      set((state) => ({ assets: state.assets.filter((a) => a.id !== tempId) }));
      return null;
    }
  },

  removeAsset: async (id) => {
    const { error } = await supabase.from('media_assets').delete().eq('id', id);
    if (error) {
      console.error('Failed to remove asset:', error);
      return;
    }
    set((state) => ({ assets: state.assets.filter((a) => a.id !== id) }));
  },

  getTotalSize: () => {
    const total = get().assets.reduce((sum, a) => sum + (a.file_size_bytes || 0), 0);
    return formatBytes(total);
  },
}));
