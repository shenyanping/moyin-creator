import { create } from 'zustand';
import { nanoid } from 'nanoid';

export interface EditChange {
  field: string;
  before: unknown;
  after: unknown;
}

export type EditAction = 'edit' | 'add';

export interface EditSnapshot {
  action: EditAction;
  targetType: 'character' | 'scene' | 'episode' | 'shot';
  targetId: string;
  projectId: string;
  previousData?: Record<string, unknown>;
  addedIds?: { scriptId: string; libraryId?: string };
}

export interface EditSuggestion {
  id: string;
  action: EditAction;
  targetType: 'character' | 'scene' | 'episode' | 'shot';
  targetId: string;
  targetName: string;
  changes: EditChange[];
  applied: boolean;
  snapshot?: EditSnapshot;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  editSuggestions?: EditSuggestion[];
  status: 'sending' | 'streaming' | 'done' | 'error';
  timestamp: number;
}

interface AssistantState {
  isOpen: boolean;
  messages: ChatMessage[];
  isStreaming: boolean;
  editingMessageId: string | null;
}

interface AssistantActions {
  toggle: () => void;
  setOpen: (open: boolean) => void;
  addUserMessage: (content: string) => string;
  addAssistantMessage: () => string;
  updateAssistantMessage: (id: string, updates: Partial<ChatMessage>) => void;
  appendAssistantContent: (id: string, delta: string) => void;
  setEditSuggestions: (messageId: string, suggestions: EditSuggestion[]) => void;
  markSuggestionApplied: (messageId: string, suggestionId: string, snapshot?: EditSnapshot) => void;
  markSuggestionReverted: (messageId: string, suggestionId: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearHistory: () => void;
  setEditingMessage: (id: string | null) => void;
  truncateFromMessage: (messageId: string) => void;
  getAppliedSuggestionsAfter: (messageId: string) => EditSuggestion[];
}

type AssistantStore = AssistantState & AssistantActions;

export const useAssistantStore = create<AssistantStore>()((set, get) => ({
  isOpen: false,
  messages: [],
  isStreaming: false,
  editingMessageId: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),

  addUserMessage: (content) => {
    const id = nanoid();
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: 'user',
          content,
          status: 'done',
          timestamp: Date.now(),
        },
      ],
    }));
    return id;
  },

  addAssistantMessage: () => {
    const id = nanoid();
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: 'assistant',
          content: '',
          status: 'streaming',
          timestamp: Date.now(),
        },
      ],
    }));
    return id;
  },

  updateAssistantMessage: (id, updates) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
  },

  appendAssistantContent: (id, delta) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + delta } : m
      ),
    }));
  },

  setEditSuggestions: (messageId, suggestions) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, editSuggestions: suggestions } : m
      ),
    }));
  },

  markSuggestionApplied: (messageId, suggestionId, snapshot) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.editSuggestions) return m;
        return {
          ...m,
          editSuggestions: m.editSuggestions.map((sg) =>
            sg.id === suggestionId ? { ...sg, applied: true, snapshot } : sg
          ),
        };
      }),
    }));
  },

  markSuggestionReverted: (messageId, suggestionId) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.editSuggestions) return m;
        return {
          ...m,
          editSuggestions: m.editSuggestions.map((sg) =>
            sg.id === suggestionId
              ? { ...sg, applied: false, snapshot: undefined }
              : sg
          ),
        };
      }),
    }));
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  clearHistory: () => set({ messages: [], isStreaming: false, editingMessageId: null }),

  setEditingMessage: (id) => set({ editingMessageId: id }),

  truncateFromMessage: (messageId) => {
    set((s) => {
      const idx = s.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return s;
      return { messages: s.messages.slice(0, idx), editingMessageId: null };
    });
  },

  getAppliedSuggestionsAfter: (messageId) => {
    const { messages } = get();
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return [];
    const after = messages.slice(idx);
    const applied: EditSuggestion[] = [];
    for (const msg of after) {
      if (msg.editSuggestions) {
        for (const sg of msg.editSuggestions) {
          if (sg.applied && sg.snapshot) applied.push(sg);
        }
      }
    }
    return applied;
  },
}));
