import { describe, expect, it } from 'vitest';
import { extractConversationOutline, isConversationOutline } from '../lib/conversation-outline';
import { buildConversationSnapshot, isConversationGraphSnapshot, type ConversationGraphNode } from '../lib/conversation-graph';

const extract = (html: string, budget?: number) => {
  const root = document.createElement('article');
  root.innerHTML = html;
  return extractConversationOutline(root, budget);
};

describe('source structure preview', () => {
  it('preserves real heading order, hierarchy and bold phrases without repeating nested markup', () => {
    expect(extract('<h2><strong>总体框架</strong></h2><p>说明 <b>重点 <strong>结论</strong></b> 内容</p><h3>实施步骤</h3><p><strong>验证结果</strong></p><h2>总结</h2><b>重点 结论</b>').items).toEqual([
      { kind: 'heading', level: 2, text: '总体框架' },
      { kind: 'emphasis', level: 3, text: '重点 结论' },
      { kind: 'heading', level: 3, text: '实施步骤' },
      { kind: 'emphasis', level: 4, text: '验证结果' },
      { kind: 'heading', level: 2, text: '总结' },
      { kind: 'emphasis', level: 3, text: '重点 结论' }
    ]);
  });
  it('ignores controls, hidden sections, and code; reads ARIA headings', () => {
    const value = extract('<button><b>复制</b></button><pre><b>代码</b></pre><code><b>代码</b></code><div hidden><h2>隐藏</h2></div><div style="display:none"><b>隐藏</b></div><p aria-hidden="true"><strong>隐藏</strong></p><div role="heading" aria-level="3">可见 <button>复制</button><code>API</code></div>');
    expect(value.items).toEqual([{ kind: 'heading', level: 3, text: '可见 API' }]);
    expect(isConversationOutline(value)).toBe(true);
  });
  it('does not invent headings from plain text and handles bold-only answers', () => {
    expect(extract('<p>这是一条没有标题或加粗的回答。</p>')).toEqual({ items: [], truncated: false });
    expect(extract('<p><b>第一步</b>内容</p><p><strong>第二步</strong></p>').items).toEqual([
      { kind: 'emphasis', level: 1, text: '第一步' }, { kind: 'emphasis', level: 1, text: '第二步' }
    ]);
  });
  it('captures late headings beyond the original text preview and bounds the payload honestly', () => {
    expect(extract(`<p>${'说明'.repeat(20_000)}</p><h2>最后的结论</h2>`).items[0]?.text).toBe('最后的结论');
    expect(extract('<h2>超过预算的章节名称</h2>', 5)).toEqual({ items: [{ kind: 'heading', level: 2, text: '超过预算…' }], truncated: true });
    const many = extract('<h2>章节</h2>'.repeat(40));
    expect(many.items).toHaveLength(32);
    expect(many.truncated).toBe(true);
    expect(extract('<b>重点</b>', 0)).toEqual({ items: [], truncated: true });
    const headingPriority = extract('<b>强调</b>'.repeat(40) + '<h2>末尾章节</h2>');
    expect(headingPriority.items).toHaveLength(32);
    expect(headingPriority.items.at(-1)?.text).toBe('末尾章节');
  });
  it('accepts older snapshots, rejects malformed structure and refreshes when only formatting changes', () => {
    const message: ConversationGraphNode = { id: 'a', title: '标题', text: '标题', searchText: '标题', fingerprint: 'same-text', role: 'assistant', order: 0, clipIds: [], isReport: false };
    const metadata = { platform: 'chatgpt' as const, conversationTitle: '标题', conversationId: '1', conversationUrl: 'https://chatgpt.com/c/1' };
    const plain = buildConversationSnapshot(metadata, [message]);
    const formatted = buildConversationSnapshot(metadata, [{ ...message, outline: extract('<h2>标题</h2>') }]);
    expect(isConversationGraphSnapshot(plain)).toBe(true);
    expect(isConversationGraphSnapshot(formatted)).toBe(true);
    expect(plain.revision).not.toBe(formatted.revision);
    for (const invalid of [null, { items: null, truncated: false }, { items: [{ kind: 'html', level: 2, text: 'x' }], truncated: false }, { items: [{ kind: 'heading', level: 7, text: 'x' }], truncated: false }, { items: [{ kind: 'heading', level: 2, text: 'x'.repeat(161) }], truncated: false }]) {
      expect(isConversationGraphSnapshot({ ...plain, nodes: [{ ...message, outline: invalid }] })).toBe(false);
    }
  });
});
