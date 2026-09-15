import { describe, expect, it } from 'vitest';
import {
  conversationElementToMarkdown, conversationExportFilename, isConversationExport,
  renderConversationExportMarkdown, type ConversationExport
} from '../lib/conversation-export';

const exported: ConversationExport = {
  version: 1,
  platform: 'chatgpt',
  conversationTitle: '导出测试',
  conversationUrl: 'https://chatgpt.com/c/one',
  conversationId: 'one',
  scope: 'current-visible-branch',
  capturedAt: '2026-09-06T06:30:00.000Z',
  messages: [
    { id: 'q1', role: 'user', markdown: '请给出示例。', order: 0, isReport: false },
    { id: 'a1', role: 'assistant', markdown: '这是回答。', order: 1, isReport: false },
    { id: 'q2', role: 'user', markdown: '再给一个。', order: 2, isReport: false },
    { id: 'a2', role: 'assistant', markdown: '第二个回答。', order: 3, isReport: false }
  ]
};

describe('conversation export', () => {
  it('将页面富文本转换为 Markdown 并移除操作按钮', () => {
    const root = document.createElement('article');
    root.innerHTML = `
      <h2>结论</h2>
      <p>请看 <strong>重点</strong> 和 <a href="https://example.com/a">来源</a>。</p>
      <ul><li>第一项</li><li>第二项</li></ul>
      <pre><code class="language-ts">const value = 1;</code></pre>
      <table><tr><th>名称</th><th>值</th></tr><tr><td>A</td><td>1</td></tr></table>
      <button>复制</button>`;

    const markdown = conversationElementToMarkdown(root);
    expect(markdown).toContain('## 结论');
    expect(markdown).toContain('**重点**');
    expect(markdown).toContain('[来源](https://example.com/a)');
    expect(markdown).toContain('- 第一项');
    expect(markdown).toContain('```ts\nconst value = 1;\n```');
    expect(markdown).toContain('| 名称 | 值 |');
    expect(markdown).not.toContain('复制');
  });

  it('按轮次输出用户与助手消息并附带范围元数据', () => {
    const markdown = renderConversationExportMarkdown(exported);
    expect(markdown).toContain('scope: "current-visible-branch"');
    expect(markdown).toContain('messages: 4');
    expect(markdown.match(/^## Round /gm)).toHaveLength(2);
    expect(markdown.match(/^### User$/gm)).toHaveLength(2);
    expect(markdown.match(/^### Assistant$/gm)).toHaveLength(2);
    expect(conversationExportFilename(exported)).toBe('导出测试-ChatGPT-2026-09-06.md');
    expect(isConversationExport(exported)).toBe(true);
  });

  it('拒绝过大的或范围声明不正确的导出数据', () => {
    expect(isConversationExport({ ...exported, scope: 'all-branches' })).toBe(false);
    expect(isConversationExport({ ...exported, messages: [{ ...exported.messages[0], markdown: 'x'.repeat(5_000_001) }] })).toBe(false);
  });
});
