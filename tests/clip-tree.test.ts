import { describe, expect, it } from 'vitest';
import { buildClipTree, validParentOptions } from '../lib/clip-tree';
import type { Clip } from '../lib/models';

const clip = (id: string, parentClipId?: string): Clip => ({
  id, parentClipId, notebookId: 'n', originalText: id, annotation: '', platform: 'chatgpt',
  conversationTitle: 't', conversationUrl: 'https://chatgpt.com/c/1', conversationId: '1',
  messageRole: 'assistant', capturedAt: '2026-08-14T00:00:00Z', highlightColor: 'yellow',
  anchor: { exact: id, prefix: '', suffix: '', messageRole: 'assistant', startOffset: 0, endOffset: id.length, status: 'resolved' }
});

describe('clip tree', () => {
  it('按父子关系构建多级导图', () => {
    const tree = buildClipTree([clip('a'), clip('b', 'a'), clip('c', 'b'), clip('d')]);
    expect(tree.map(node => node.clip.id)).toEqual(['a', 'd']);
    expect(tree[0]!.children[0]!.children[0]!.clip.id).toBe('c');
  });

  it('父级选项排除自身与后代以防止循环', () => {
    const clips = [clip('a'), clip('b', 'a'), clip('c', 'b'), clip('d')];
    expect(validParentOptions(clips[0]!, clips).map(item => item.id)).toEqual(['d']);
  });

  it('损坏的循环数据仍能作为根节点展示', () => {
    const tree = buildClipTree([clip('a', 'b'), clip('b', 'a')]);
    expect(new Set(tree.map(node => node.clip.id))).toEqual(new Set(['a', 'b']));
  });
});
