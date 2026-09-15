import type { ConversationGraphNode } from './conversation-graph';

export interface ConversationTurn {
  id: string;
  number: number;
  messages: ConversationGraphNode[];
  question?: ConversationGraphNode;
  answer?: ConversationGraphNode;
  clipIds: string[];
}

/** Group the complete path before filtering so a clipped answer keeps its question. */
export function buildConversationTurns(nodes: ConversationGraphNode[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const message of [...nodes].sort((a, b) => a.order - b.order)) {
    const previous = turns.at(-1);
    if (message.role === 'assistant' && previous?.question && !previous.answer &&
      previous.messages.at(-1)!.order + 1 === message.order) {
      previous.answer = message;
      previous.messages.push(message);
      previous.clipIds = [...new Set([...previous.clipIds, ...message.clipIds])];
    } else {
      turns.push({
        id: message.id, number: turns.length + 1, messages: [message],
        question: message.role === 'user' ? message : undefined,
        answer: message.role === 'assistant' ? message : undefined,
        clipIds: [...new Set(message.clipIds)]
      });
    }
  }
  return turns;
}

export function filterConversationTurns(turns: ConversationTurn[], onlyClipped: boolean, query: string): ConversationTurn[] {
  const search = query.trim().toLocaleLowerCase();
  return turns.filter(turn => (!onlyClipped || turn.clipIds.length > 0) &&
    (!search || turn.messages.some(message => message.searchText.toLocaleLowerCase().includes(search))));
}

/** An exact, compact source excerpt, never presented as a generated summary. */
export function conversationPreview(message: ConversationGraphNode): string {
  return (message.text || message.searchText).replace(/\s+/g, ' ').trim();
}

export function defaultTurnMessage(turn: ConversationTurn): ConversationGraphNode {
  return turn.answer ?? turn.question ?? turn.messages[0]!;
}
