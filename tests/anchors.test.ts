import { describe, expect, it } from 'vitest';
import { locateText, locateTextSegments, uniqueTextOffset } from '../lib/anchors';
import type { TextAnchor } from '../lib/models';

const anchor = (patch: Partial<TextAnchor> = {}): TextAnchor => ({
  exact: '关键内容', prefix: '前文', suffix: '后文', messageRole: 'assistant',
  startOffset: 2, endOffset: 6, status: 'resolved', ...patch
});

describe('anchor matching', () => {
  it('优先使用已保存偏移', () => expect(uniqueTextOffset('前文关键内容后文', anchor())).toBe(2));
  it('偏移失效后使用前后文唯一定位', () => expect(uniqueTextOffset('新增前文关键内容后文', anchor({ startOffset: 0, endOffset: 4 }))).toBe(4));
  it('原文唯一时允许前后文发生变化', () => expect(uniqueTextOffset('新的上下文关键内容已重排', anchor({ startOffset: 99, endOffset: 103 }))).toBe(5));
  it('重复且无法区分时拒绝定位', () => expect(uniqueTextOffset('关键内容…关键内容', anchor({ prefix: '', suffix: '', startOffset: 99, endOffset: 103 }))).toBeNull());
  it('只在单个文本节点内创建安全位置', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>前文关键内容后文</p>';
    const result = locateText(root, anchor());
    expect(result?.node.data).toBe('前文关键内容后文');
    expect(result?.start).toBe(2);
  });
  it('跨格式节点时返回多个可独立包装的文本段', () => {
    const root = document.createElement('div');
    root.innerHTML = '前文关<strong>键内</strong>容后文';
    const segments = locateTextSegments(root, anchor());
    expect(segments.map(segment => segment.node.data.slice(segment.start, segment.end))).toEqual(['关', '键内', '容']);
  });
  it('同一消息已有较早高亮时仍正确计算后续摘录偏移', () => {
    const root = document.createElement('div');
    root.innerHTML = '<mark data-dialogue-clip-id="earlier">较早的摘录</mark>，中间内容，后续摘录';
    const later = anchor({
      exact: '后续摘录', prefix: '，中间内容，', suffix: '',
      startOffset: 11, endOffset: 15
    });
    const segments = locateTextSegments(root, later);
    expect(segments.map(segment => segment.node.data.slice(segment.start, segment.end))).toEqual(['后续摘录']);
  });
});
