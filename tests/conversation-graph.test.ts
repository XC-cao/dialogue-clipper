import { describe, expect, it } from 'vitest';
import {
  attachClipsToConversationNodes, buildConversationSnapshot, conversationNodeId,
  conversationNodeLocator, conversationTextFingerprint, findConversationNodeByLocator, findConversationNodeForClip, generateConversationNodeTitle, isConversationGraphSnapshot, parseBranchInfo, type ConversationGraphNode
} from '../lib/conversation-graph';
import type { Clip } from '../lib/models';

const node = (id: string, order: number): ConversationGraphNode => ({
  id, order, messageId: id, role: order % 2 ? 'assistant' : 'user', title: id, text: id,
  searchText: id, fingerprint: conversationTextFingerprint(id), clipIds: [], isReport: false
});

const clip = (id: string, messageId: string, exact: string): Clip => ({
  id, notebookId: 'n', originalText: exact, annotation: '', platform: 'chatgpt',
  conversationTitle: 't', conversationUrl: 'https://chatgpt.com/c/1', conversationId: '1',
  messageRole: 'assistant', capturedAt: '2026-08-20', highlightColor: 'yellow',
  anchor: { exact, prefix: '', suffix: '', messageId, messageRole: 'assistant', startOffset: 0, endOffset: exact.length, status: 'resolved' }
});

describe('conversation graph', () => {
  it('按页面顺序构建消息路径并保留当前节点', () => {
    const snapshot = buildConversationSnapshot(
      { platform: 'chatgpt', conversationTitle: '对话', conversationUrl: 'https://chatgpt.com/c/1', conversationId: '1' },
      [node('b', 1), node('a', 0), node('c', 2)],
      'b'
    );
    expect(snapshot.nodes.map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(snapshot.edges.map(edge => [edge.source, edge.target])).toEqual([['a', 'b'], ['b', 'c']]);
    expect(snapshot.activeNodeId).toBe('b');
    expect(isConversationGraphSnapshot(snapshot)).toBe(true);
  });

  it('通过消息标识或锚点原文关联摘录', () => {
    const clips = [clip('one', 'm1', '关键结论'), clip('two', 'm2', '另一个片段')];
    const nodes = [
      { ...node('a', 0), messageId: 'm1', role: 'assistant' as const, text: '消息预览', searchText: '正文中的关键结论仍然存在' },
      { ...node('b', 1), messageId: undefined, role: 'assistant' as const, text: '消息预览', searchText: '这里包含另一个片段' }
    ];
    expect(attachClipsToConversationNodes(nodes, clips).map(item => item.clipIds)).toEqual([['one'], ['two']]);
  });

  it('从摘录回到对话图时可用关联、消息标识或唯一原文定位', () => {
    const targetClip = clip('one', 'm1', '关键结论');
    const byId = { ...node('a', 0), messageId: 'm1', role: 'assistant' as const, searchText: '内容已经被编辑' };
    expect(findConversationNodeForClip([byId], targetClip)?.id).toBe('a');
    expect(findConversationNodeForClip([{ ...byId, messageId: undefined, searchText: '正文包含关键结论' }], targetClip)?.id).toBe('a');
  });

  it('刷新后优先用稳定标识和内容定位，不先信任旧顺序', () => {
    const original = { ...node('old', 1), messageId: 'stable', role: 'assistant' as const, searchText: '唯一答案' };
    const locator = { ...conversationNodeLocator(original), order: 0 };
    const shifted = [
      { ...node('wrong', 0), role: 'assistant' as const, searchText: '另一条回答' },
      { ...original, id: 'fresh', order: 1 }
    ];
    expect(findConversationNodeByLocator(shifted, locator)?.id).toBe('fresh');
    expect(findConversationNodeByLocator(shifted.map(item => ({ ...item, messageId: undefined })), { ...locator, messageId: undefined })?.id).toBe('fresh');
  });

  it('重复原文无法唯一确定消息时不误关联摘录', () => {
    const clips = [clip('one', 'missing', '重复片段')];
    const nodes = [
      { ...node('a', 0), role: 'assistant' as const, text: '预览', searchText: '包含重复片段' },
      { ...node('b', 1), role: 'assistant' as const, text: '预览', searchText: '也包含重复片段' }
    ];
    expect(attachClipsToConversationNodes(nodes, clips).every(item => item.clipIds.length === 0)).toBe(true);
  });

  it('稳定生成节点标识并解析分支计数', () => {
    expect(conversationNodeId('c1', 'm1', 'assistant', 2)).toBe(conversationNodeId('c1', 'm1', 'assistant', 9));
    document.body.innerHTML = '<article><div class="message">回答</div><button aria-label="Response 2 of 3">2 / 3</button></article>';
    expect(parseBranchInfo(document.querySelector('.message') as HTMLElement)).toEqual({ index: 2, count: 3 });
  });

  it('优先使用 Markdown 标题，并从普通消息生成简短标题', () => {
    expect(generateConversationNodeTitle('当然可以！\n\n## 状态同步的根本原因\n正文内容')).toBe('状态同步的根本原因');
    expect(generateConversationNodeTitle('请帮我分析这段代码为什么会报错，并给出一个可以直接运行的修复方案。后续内容')).toBe('请帮我分析这段代码为什么会报错…');
    expect(generateConversationNodeTitle('```ts\nconst value = 1;\n```')).toBe('const value = 1');
  });

  it('长消息后半段仍能关联摘录，错误分支不会仅凭轮次标识误关联', () => {
    const exact = '第 20001 字之后的关键摘录';
    const longText = `${'前文'.repeat(10_100)}${exact}`;
    const current = { ...node('a', 0), messageId: 'turn-4', role: 'assistant' as const, searchText: longText.slice(0, 20_000) };
    expect(attachClipsToConversationNodes([current], [clip('late', 'turn-4', exact)], new Map([['a', longText]]))[0]!.clipIds).toEqual(['late']);
    expect(attachClipsToConversationNodes([{ ...current, searchText: '这是另一个分支的回答' }], [clip('late', 'turn-4', exact)])[0]!.clipIds).toEqual([]);
  });

  it('拒绝能力声明或边端点不合法的快照', () => {
    const snapshot = buildConversationSnapshot(
      { platform: 'chatgpt', conversationTitle: '对话', conversationUrl: 'https://chatgpt.com/c/1', conversationId: '1' },
      [node('a', 0)]
    );
    expect(isConversationGraphSnapshot({ ...snapshot, capabilities: { activePathOnly: false, hiddenBranches: false } })).toBe(false);
    expect(isConversationGraphSnapshot({ ...snapshot, edges: [{ id: 'bad', source: 'missing', target: 'a' }] })).toBe(false);
  });
});
