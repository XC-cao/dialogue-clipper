import type { CapturePayload, Clip } from './models';
import type { ConversationGraphSnapshot, ConversationNodeLocator } from './conversation-graph';

export type ExtensionMessage =
  | { version: 1; type: 'CAPTURE_SELECTION'; payload: CapturePayload }
  | { version: 1; type: 'CAPTURE_CURRENT_SELECTION' }
  | { version: 1; type: 'CAPTURE_RESULT'; ok: boolean; clip?: Clip; pending?: boolean; error?: string }
  | { version: 1; type: 'REFRESH_HIGHLIGHTS' }
  | { version: 1; type: 'SCROLL_TO_CLIP'; clipId: string }
  | { version: 1; type: 'SCROLL_TO_CLIP_RESULT'; ok: boolean; exact: boolean }
  | { version: 1; type: 'UPDATE_ANCHOR_STATUSES'; statuses: Record<string, 'resolved' | 'unresolved'> }
  | { version: 1; type: 'FOCUS_CLIP'; clipId: string }
  | { version: 1; type: 'START_CONVERSATION_GRAPH' }
  | { version: 1; type: 'STOP_CONVERSATION_GRAPH' }
  | { version: 1; type: 'GET_CONVERSATION_GRAPH' }
  | { version: 1; type: 'CONVERSATION_GRAPH_RESULT'; ok: boolean; snapshot?: ConversationGraphSnapshot; error?: string }
  | { version: 1; type: 'CONVERSATION_GRAPH_UPDATED'; snapshot: ConversationGraphSnapshot }
  | { version: 1; type: 'CONVERSATION_GRAPH_CLEARED'; conversationUrl: string }
  | { version: 1; type: 'CONVERSATION_ACTIVE_NODE'; conversationUrl: string; nodeId?: string }
  | { version: 1; type: 'SCROLL_TO_CONVERSATION_NODE'; nodeId: string; conversationUrl: string; locator: ConversationNodeLocator }
  | { version: 1; type: 'SCROLL_TO_CONVERSATION_NODE_RESULT'; ok: boolean };

export function isCapturePayload(value: unknown): value is CapturePayload {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (
    typeof item.originalText !== 'string' ||
    item.originalText.trim().length === 0 ||
    !['chatgpt', 'claude', 'gemini'].includes(String(item.platform)) ||
    typeof item.conversationTitle !== 'string' ||
    typeof item.conversationUrl !== 'string' ||
    typeof item.conversationId !== 'string'
  ) return false;
  const anchor = item.anchor as Record<string, unknown> | undefined;
  return Boolean(
    anchor &&
    anchor.exact === item.originalText &&
    typeof anchor.prefix === 'string' &&
    typeof anchor.suffix === 'string' &&
    typeof anchor.startOffset === 'number' &&
    typeof anchor.endOffset === 'number'
  );
}
