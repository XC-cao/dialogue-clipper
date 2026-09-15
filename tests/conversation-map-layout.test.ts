import { describe, expect, it } from 'vitest';
import { buildConversationMapConnections, CONVERSATION_ROW_HEIGHT, layoutConversationTurns } from '../lib/conversation-map-layout';
import { conversationTextFingerprint, type ConversationGraphNode } from '../lib/conversation-graph';

const node = (id: string, order: number, role: ConversationGraphNode['role']): ConversationGraphNode => ({
  id, order, role, title: id, text: id, searchText: id,
  fingerprint: conversationTextFingerprint(id), clipIds: [], isReport: false
});

describe('conversation map compact layout', () => {
  it('将每轮问题与回答放在同一行', () => {
    const result = layoutConversationTurns([
      node('q1', 0, 'user'), node('a1', 1, 'assistant'),
      node('q2', 2, 'user'), node('a2', 3, 'assistant')
    ]);

    expect(result.rowCount).toBe(2);
    expect(result.placements.q1?.y).toBe(result.placements.a1?.y);
    expect(result.placements.q2?.y).toBe(result.placements.a2?.y);
    expect(result.placements.q2!.y - result.placements.q1!.y).toBe(CONVERSATION_ROW_HEIGHT);
    expect(result.placements.q1!.x).toBeLessThan(result.placements.a1!.x);
    expect(result.placements.a2?.round).toBe(2);
  });

  it('连续同角色消息独立换行以避免重叠', () => {
    const result = layoutConversationTurns([
      node('q1', 0, 'user'), node('q2', 1, 'user'),
      node('a2', 2, 'assistant'), node('a3', 3, 'assistant')
    ]);

    expect(result.rowCount).toBe(3);
    expect(result.placements.q2?.y).toBe(result.placements.a2?.y);
    expect(result.placements.a3!.y).toBeGreaterThan(result.placements.a2!.y);
  });

  it('助手消息单独出现时仍生成可读行', () => {
    const result = layoutConversationTurns([node('a1', 3, 'assistant')]);
    expect(result.rowCount).toBe(1);
    expect(result.placements.a1).toMatchObject({ row: 0, round: 1 });
  });

  it('只把问题到同轮回答表达为答复箭头', () => {
    expect(buildConversationMapConnections([
      node('q1', 0, 'user'), node('a1', 1, 'assistant'),
      node('q2', 2, 'user'), node('a2', 3, 'assistant')
    ])).toEqual([
      { source: 'q1', target: 'a1', relation: 'answer', omitted: 0 },
      { source: 'a1', target: 'q2', relation: 'sequence', omitted: 0 },
      { source: 'q2', target: 'a2', relation: 'answer', omitted: 0 }
    ]);
  });

  it('过滤后跨消息的连接标记为省略而非回答关系', () => {
    expect(buildConversationMapConnections([
      node('q1', 0, 'user'), node('a2', 5, 'assistant')
    ])).toEqual([{ source: 'q1', target: 'a2', relation: 'omitted', omitted: 4 }]);
  });
});
