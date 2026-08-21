import { describe, expect, it } from 'vitest';
import { layoutMindMap, MIND_MAP_ROOT_ID } from '../lib/mind-map-layout';
import type { Clip, Notebook } from '../lib/models';

const notebook: Notebook = {
  id: 'n', title: '主题', description: '', clipIds: ['a', 'b', 'c'],
  createdAt: '2026-08-14', updatedAt: '2026-08-14', schemaVersion: 1
};

const clip = (id: string, parentClipId?: string): Clip => ({
  id, parentClipId, notebookId: 'n', originalText: id, annotation: '', platform: 'chatgpt',
  conversationTitle: 't', conversationUrl: 'https://chatgpt.com/c/1', conversationId: '1',
  messageRole: 'assistant', capturedAt: '2026-08-14T00:00:00Z', highlightColor: 'yellow',
  anchor: { exact: id, prefix: '', suffix: '', messageRole: 'assistant', startOffset: 0, endOffset: id.length, status: 'resolved' }
});

describe('mind map layout', () => {
  it('为根节点和多级摘录生成从左向右的坐标与连接', () => {
    const result = layoutMindMap(notebook, [clip('a'), clip('b', 'a'), clip('c')]);
    expect(result.edges).toEqual([
      { id: `edge-${MIND_MAP_ROOT_ID}-a`, source: MIND_MAP_ROOT_ID, target: 'a' },
      { id: 'edge-a-b', source: 'a', target: 'b' },
      { id: `edge-${MIND_MAP_ROOT_ID}-c`, source: MIND_MAP_ROOT_ID, target: 'c' }
    ]);
    expect(result.positions.a!.x).toBeGreaterThan(result.positions[MIND_MAP_ROOT_ID]!.x);
    expect(result.positions.b!.x).toBeGreaterThan(result.positions.a!.x);
  });

  it('父节点缺失时安全回退到主题根节点', () => {
    const result = layoutMindMap(notebook, [clip('a', 'missing')]);
    expect(result.edges[0]).toMatchObject({ source: MIND_MAP_ROOT_ID, target: 'a' });
  });
});
