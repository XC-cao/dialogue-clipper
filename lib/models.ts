export const SCHEMA_VERSION = 1 as const;

export type Platform = 'chatgpt' | 'claude' | 'gemini';
export type MessageRole = 'user' | 'assistant' | 'unknown';
export type AnchorStatus = 'resolved' | 'unresolved';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface TextAnchor {
  exact: string;
  prefix: string;
  suffix: string;
  messageId?: string;
  messageRole: MessageRole;
  startOffset: number;
  endOffset: number;
  domPath?: string;
  status: AnchorStatus;
}

export interface Clip {
  id: string;
  notebookId: string;
  parentClipId?: string;
  originalText: string;
  annotation: string;
  platform: Platform;
  conversationTitle: string;
  conversationUrl: string;
  conversationId: string;
  messageRole: MessageRole;
  capturedAt: string;
  highlightColor: HighlightColor;
  anchor: TextAnchor;
}

export interface Notebook {
  id: string;
  title: string;
  description: string;
  clipIds: string[];
  mindMapPositions?: Record<string, { x: number; y: number }>;
  createdAt: string;
  updatedAt: string;
  schemaVersion: typeof SCHEMA_VERSION;
}

export interface CapturePayload {
  originalText: string;
  platform: Platform;
  conversationTitle: string;
  conversationUrl: string;
  conversationId: string;
  messageRole: MessageRole;
  anchor: TextAnchor;
}

export interface StoredState {
  schemaVersion: typeof SCHEMA_VERSION;
  notebooks: Record<string, Notebook>;
  clips: Record<string, Clip>;
  currentNotebookId: string | null;
  pendingCaptures: CapturePayload[];
}

export const EMPTY_STATE: StoredState = {
  schemaVersion: SCHEMA_VERSION,
  notebooks: {},
  clips: {},
  currentNotebookId: null,
  pendingCaptures: []
};
