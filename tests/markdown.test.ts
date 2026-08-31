import { describe, expect, it } from 'vitest';
import { markdownFilename, renderMarkdown } from '../lib/markdown';
import type { Clip, Notebook } from '../lib/models';

const notebook: Notebook = {
  id: 'n1', title: '方法：A/B?', description: '保持原文。', clipIds: ['c1'],
  createdAt: '2026-08-13T01:00:00.000Z', updatedAt: '2026-08-14T01:00:00.000Z', schemaVersion: 1
};
const clip: Clip = {
  id: 'c1', notebookId: 'n1', originalText: '第一行\n\n第二行', annotation: '我的判断', platform: 'chatgpt',
  conversationTitle: '标题 [草稿]', conversationUrl: 'https://chatgpt.com/c/a(b)', conversationId: 'a', messageRole: 'assistant',
  capturedAt: '2026-08-13T06:30:00.000Z', highlightColor: 'yellow',
  anchor: { exact: '第一行\n\n第二行', prefix: '', suffix: '', messageRole: 'assistant', startOffset: 0, endOffset: 8, status: 'resolved' }
};

describe('renderMarkdown', () => {
  it('保留多行原文、批注和经过转义的来源', () => {
    const result = renderMarkdown(notebook, [clip]);
    expect(result).toContain('title: "方法：A/B?"');
    expect(result).toContain('> 第一行\n> \n> 第二行');
    expect(result).toContain('**My annotation**\n\n我的判断');
    expect(result).toContain('[标题 \\[草稿\\]](https://chatgpt.com/c/a\\(b\\))');
  });

  it('空批注时省略批注标题', () => {
    expect(renderMarkdown(notebook, [{ ...clip, annotation: '  ' }])).not.toContain('My annotation');
  });

  it('生成安全文件名', () => {
    expect(markdownFilename(notebook)).toBe('方法-A-B--2026-08-14.md');
  });
});
