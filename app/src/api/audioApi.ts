/**
 * Audio API — fetch wrappers for backend audio endpoints.
 */

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

async function request<T>(endpoint: string, options: RequestInit = {}, timeout = 30_000): Promise<T> {
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

export interface WaveformResponse {
  success: boolean;
  amplitudes: number[];
  duration: number;
}

export interface SilenceSegment {
  start: number;
  end: number;
}

export interface SilenceResponse {
  success: boolean;
  segments: SilenceSegment[];
  total_silence_seconds: number;
}

export interface SmartCutResponse {
  success: boolean;
  message: string;
  output_path: string;
  segments_removed: number;
  time_saved_seconds: number;
}

export const audioApi = {
  getWaveform: (video_path: string, num_points = 1000) =>
    request<WaveformResponse>('/api/v1/audio/waveform', {
      method: 'POST',
      body: JSON.stringify({ video_path, num_points }),
    }, 60_000),

  detectSilence: (video_path: string, threshold_db = -40, min_silence_ms = 500) =>
    request<SilenceResponse>('/api/v1/audio/silence', {
      method: 'POST',
      body: JSON.stringify({ video_path, threshold_db, min_silence_ms }),
    }, 60_000),

  smartCut: (video_path: string, output_path: string, threshold_db = -40, min_silence_ms = 500) =>
    request<SmartCutResponse>('/api/v1/audio/smart-cut', {
      method: 'POST',
      body: JSON.stringify({ video_path, output_path, threshold_db, min_silence_ms }),
    }, 120_000),
};
