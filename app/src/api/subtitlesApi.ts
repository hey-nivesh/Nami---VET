/**
 * Subtitles API — fetch wrappers for backend subtitle endpoints.
 */

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

async function request<T>(endpoint: string, options: RequestInit = {}, timeout = 120_000): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
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

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

export interface GenerateResponse {
  success: boolean;
  segments: SubtitleSegment[];
  total_segments: number;
  language?: string;
}

export interface ExportResponse {
  success: boolean;
  message: string;
  output_path: string;
}

export const subtitlesApi = {
  generate: (video_path: string, language?: string) =>
    request<GenerateResponse>('/api/v1/subtitles/generate', {
      method: 'POST',
      body: JSON.stringify({ video_path, language }),
    }, 120_000),

  exportSubtitles: (segments: SubtitleSegment[], format: 'srt' | 'vtt' | 'json', output_path: string) =>
    request<ExportResponse>('/api/v1/subtitles/export', {
      method: 'POST',
      body: JSON.stringify({ segments, format, output_path }),
    }),
};
