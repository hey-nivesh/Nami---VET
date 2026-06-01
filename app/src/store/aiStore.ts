/**
 * AI Store — chat assistant state management.
 */

import { create } from 'zustand';
import { aiApi } from '../api/aiApi';
import { supabase } from '../api/supabaseClient';
import { useTimelineStore } from './timelineStore';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  projectId: string | null;
  steps: { tool: string; args: any; status: 'running' | 'success' | 'failed'; result?: string }[];
  ws: WebSocket | null;

  setProjectId: (id: string) => void;
  loadHistory: (projectId: string) => Promise<void>;
  sendMessage: (content: string, context?: { currentClip?: string; projectName?: string }) => Promise<void>;
  clearHistory: () => void;
  subscribeToSync: (projectId: string) => () => void;
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useAIStore = create<AIState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  projectId: null,
  steps: [],
  ws: null,

  setProjectId: (id) => set({ projectId: id }),

  loadHistory: async (projectId) => {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load AI history:', error);
      return;
    }

    const messages: Message[] = (data || [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.created_at),
      }));

    set({ messages, projectId });
  },

  sendMessage: async (content, context) => {
    const { messages, projectId } = get();

    // Add user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    set({ messages: [...messages, userMessage], isLoading: true, error: null, steps: [] });

    // Save user message to Supabase
    let userId = '';
    if (projectId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        supabase.from('ai_conversations').insert({
          project_id: projectId,
          user_id: user.id,
          role: 'user',
          content,
        }).then();
      }
    }

    try {
      // Build messages for API (last 20 messages for context window)
      const currentMessages = get().messages;
      const apiMessages = currentMessages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await aiApi.chat(apiMessages, {
        current_clip: context?.currentClip,
        project_name: context?.projectName,
        project_id: projectId || undefined,
        user_id: userId || undefined,
      });

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
        steps: response.steps || [],
      }));

      // Save assistant message to Supabase
      if (projectId && userId) {
        supabase.from('ai_conversations').insert({
          project_id: projectId,
          user_id: userId,
          role: 'assistant',
          content: response.message,
        }).then();
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to get AI response';
      set({ isLoading: false, error: errorMsg, steps: [] });
    }
  },

  clearHistory: () => set({ messages: [] }),

  subscribeToSync: (projectId) => {
    // Clean up existing websocket if open
    const currentWs = get().ws;
    if (currentWs) {
      currentWs.close();
    }

    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
    const wsUrl = backendUrl.replace(/^http/, 'ws') + `/ws/${projectId}`;
    console.log(`[WS] Connecting to ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    set({ ws });

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS] Received event:', data);
        
        // Retrieve timeline store actions directly
        const { updateClip, addEffectToClip, removeEffectFromClip, setTracks } = 
          useTimelineStore.getState();

        switch (data.event) {
          case 'clip_updated':
            updateClip(data.clip_id, data.changes);
            break;
          case 'effect_added':
            addEffectToClip(data.clip_id, data.effect);
            break;
          case 'effect_removed':
            removeEffectFromClip(data.clip_id, data.effect_type);
            break;
          case 'timeline_updated':
            setTracks(data.tracks, data.duration);
            break;
        }
      } catch (err) {
        console.error('[WS] Error processing sync message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Connection closed.');
      set({ ws: null });
    };

    ws.onerror = (err) => {
      console.error('[WS] Connection error:', err);
    };

    // Return unsubscriber function
    return () => {
      ws.close();
      set({ ws: null });
    };
  },
}));
