/**
 * Video API — fetch wrappers for backend video endpoints.
 */

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const VIDEO_TIMEOUT = 120_000;

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout = VIDEO_TIMEOUT
): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }

    return res.json();
  } finally {
    clearTimeout(id);
  }
}

export interface VideoOperationResponse {
  success: boolean;
  message: string;
  output_path?: string;
  data?: Record<string, unknown>;
}

export interface ThumbnailResponse {
  success: boolean;
  thumbnail: string; // data:image/jpeg;base64,...
}

export const videoApi = {
  trim: (input_path: string, output_path: string, start_time: number, end_time: number) =>
    request<VideoOperationResponse>('/api/v1/video/trim', {
      method: 'POST',
      body: JSON.stringify({ input_path, output_path, start_time, end_time }),
    }),

  concat: (clip_paths: string[], output_path: string) =>
    request<VideoOperationResponse>('/api/v1/video/concat', {
      method: 'POST',
      body: JSON.stringify({ clip_paths, output_path }),
    }),

  exportVideo: (
    input_path: string,
    output_path: string,
    format = 'mp4',
    resolution?: string,
    bitrate?: string
  ) =>
    request<VideoOperationResponse>('/api/v1/video/export', {
      method: 'POST',
      body: JSON.stringify({ input_path, output_path, format, resolution, bitrate }),
    }),

  getThumbnail: (path: string, timestamp = 1.0) =>
    request<ThumbnailResponse>(
      `/api/v1/video/thumbnail?path=${encodeURIComponent(path)}&timestamp=${timestamp}`,
      { method: 'GET' },
      30_000
    ),

  splitClip: (input_path: string, split_at_seconds: number, output_dir: string) =>
    request<VideoOperationResponse>('/api/v1/video/split', {
      method: 'POST',
      body: JSON.stringify({ input_path, split_at_seconds, output_dir }),
    }),

  getInfo: (path: string) =>
    request<VideoOperationResponse>(
      `/api/v1/video/info?path=${encodeURIComponent(path)}`,
      { method: 'GET' },
      30_000
    ),

  speed: (input_path: string, output_path: string, speed_factor: number, reverse = false) =>
    request<VideoOperationResponse>('/api/v1/video/speed', {
      method: 'POST',
      body: JSON.stringify({ input_path, output_path, speed_factor, reverse }),
    }),

  freeze: (input_path: string, output_path: string, at_seconds: number, duration_seconds: number) =>
    request<VideoOperationResponse>('/api/v1/video/freeze', {
      method: 'POST',
      body: JSON.stringify({ input_path, output_path, at_seconds, duration_seconds }),
    }),

  transition: (clip_a_path: string, clip_b_path: string, output_path: string, transition_type: string, duration_seconds = 0.5) =>
    request<VideoOperationResponse>('/api/v1/video/transition', {
      method: 'POST',
      body: JSON.stringify({ clip_a_path, clip_b_path, output_path, transition_type, duration_seconds }),
    }),

  addText: (input_path: string, output_path: string, text: string, start_time: number, end_time: number, position = 'bottom_center', font_size = 48, color = 'white', animation = 'none') =>
    request<VideoOperationResponse>('/api/v1/video/add_text', {
      method: 'POST',
      body: JSON.stringify({ input_path, output_path, text, start_time, end_time, position, font_size, color, animation }),
    }),

  overlayImage: (input_path: string, overlay_path: string, output_path: string, x = 10, y = 10, width = 100, height = 100, opacity = 1.0, start_time = 0.0, end_time = 10.0) =>
    request<VideoOperationResponse>('/api/v1/video/overlay_image', {
      method: 'POST',
      body: JSON.stringify({ input_path, overlay_path, output_path, x, y, width, height, opacity, start_time, end_time }),
    }),

  colorGrade: (input_path: string, output_path: string, effects_stack: any[]) =>
    request<VideoOperationResponse>('/api/v1/video/color_grade', {
      method: 'POST',
      body: JSON.stringify({ input_path, output_path, effects_stack }),
    }),

  removeSilences: (input_path: string, output_path: string, silence_segments: { start: number; end: number }[]) =>
    request<VideoOperationResponse>('/api/v1/video/remove_silences', {
      method: 'POST',
      body: JSON.stringify({ input_path, output_path, silence_segments }),
    }),

  getThumbnailStrip: (video_path: string, count = 10) =>
    request<{ success: boolean; thumbnails: string[] }>('/api/v1/video/thumbnail_strip', {
      method: 'POST',
      body: JSON.stringify({ video_path, count }),
    }),
};
