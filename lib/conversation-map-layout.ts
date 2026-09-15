import type { ConversationGraphNode } from './conversation-graph';

export const CONVERSATION_ROW_HEIGHT = 84;
export const CONVERSATION_NODE_HEIGHT = 72;
export const CONVERSATION_USER_X = 24;
export const CONVERSATION_ASSISTANT_X = 176;
export const CONVERSATION_UNKNOWN_X = 100;

export interface ConversationMapPlacement {
  row: number;
  round: number;
  x: number;
  y: number;
}

export interface ConversationMapLayout {
  placements: Record<string, ConversationMapPlacement>;
  rowCount: number;
}

export interface ConversationMapConnection {
  source: string;
  target: string;
  relation: 'answer' | 'sequence' | 'omitted';
  omitted: number;
}

/**
 * Places a user prompt and its following assistant answer on the same row.
 * Unexpected or repeated roles receive their own row so malformed page data
 * never causes cards to overlap.
 */
export function layoutConversationTurns(messages: ConversationGraphNode[]): ConversationMapLayout {
  const placements: ConversationMapLayout['placements'] = {};
  let row = -1;
  let round = 0;
  let rowHasUser = false;
  let rowHasAssistant = false;

  for (const message of [...messages].sort((a, b) => a.order - b.order)) {
    if (message.role === 'user') {
      row += 1;
      round += 1;
      rowHasUser = true;
      rowHasAssistant = false;
    } else if (message.role === 'assistant') {
      if (row < 0 || rowHasAssistant || !rowHasUser) {
        row += 1;
        round += 1;
        rowHasUser = false;
      }
      rowHasAssistant = true;
    } else {
      row += 1;
      round += 1;
      rowHasUser = false;
      rowHasAssistant = false;
    }

    placements[message.id] = {
      row,
      round,
      x: message.role === 'user'
        ? CONVERSATION_USER_X
        : message.role === 'assistant'
          ? CONVERSATION_ASSISTANT_X
          : CONVERSATION_UNKNOWN_X,
      y: 18 + row * CONVERSATION_ROW_HEIGHT
    };
  }

  return { placements, rowCount: row + 1 };
}

/** Separates semantic question→answer arrows from neutral chronological links. */
export function buildConversationMapConnections(messages: ConversationGraphNode[]): ConversationMapConnection[] {
  const ordered = [...messages].sort((a, b) => a.order - b.order);
  const layout = layoutConversationTurns(ordered);
  return ordered.slice(1).map((target, index) => {
    const source = ordered[index]!;
    const omitted = Math.max(0, target.order - source.order - 1);
    const sameRound = layout.placements[source.id]?.round === layout.placements[target.id]?.round;
    return {
      source: source.id,
      target: target.id,
      relation: omitted > 0
        ? 'omitted'
        : source.role === 'user' && target.role === 'assistant' && sameRound
          ? 'answer'
          : 'sequence',
      omitted
    };
  });
}
