/**
 * AI Chat API — fetch wrapper for the AI assistant endpoint.
 */

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  current_clip?: string;
  project_name?: string;
  project_id?: string;
  user_id?: string;
}

export interface ChatResponse {
  success: boolean;
  message: string;
  role: string;
  steps?: { tool: string; args: any; status: 'running' | 'success' | 'failed'; result?: string }[];
}

export const aiApi = {
  chat: async (messages: ChatMessage[], context?: ChatContext): Promise<ChatResponse> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, context }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail || `HTTP ${res.status}`);
      }

      return res.json();
    } finally {
      clearTimeout(id);
    }
  },
};
