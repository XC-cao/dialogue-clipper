import { beforeEach, describe, expect, it } from 'vitest';
import { chatgptAdapter } from '../lib/adapters/chatgpt';
import { claudeAdapter } from '../lib/adapters/claude';
import { geminiAdapter } from '../lib/adapters/gemini';

beforeEach(() => { document.body.innerHTML = ''; });

describe('site adapters', () => {
  it('解析 ChatGPT 消息角色和标识', () => {
    document.body.innerHTML = '<article data-testid="conversation-turn-2"><div data-message-id="changing-id"><div data-message-author-role="assistant">answer</div></div></article>';
    const node = document.querySelector('[data-message-author-role]')!.firstChild!;
    const root = chatgptAdapter.messageRoot(node)!;
    expect(chatgptAdapter.messageId(root)).toBe('changing-id');
    expect(chatgptAdapter.messageRole(root)).toBe('assistant');
    expect(root.tagName).toBe('ARTICLE');
  });

  it('解析 Claude 用户消息', () => {
    document.body.innerHTML = '<div data-testid="user-message" id="m1">question</div>';
    const root = claudeAdapter.messageRoot(document.querySelector('div')!.firstChild!)!;
    expect(claudeAdapter.messageRole(root)).toBe('user');
    expect(claudeAdapter.messageId(root)).toBe('m1');
  });

  it('Claude 嵌套字体节点只归一化为一个消息根', () => {
    document.body.innerHTML = '<div data-testid="assistant-message" id="a1"><div class="font-claude-message"><p>回答</p></div></div>';
    expect(claudeAdapter.contentRoots()).toHaveLength(1);
    expect(claudeAdapter.contentRoots()[0]!.id).toBe('a1');
  });

  it('解析 Claude 新版 response 内容容器', () => {
    document.body.innerHTML = '<div class="font-claude-response" id="a2"><div data-testid="message-content"><p>新版回答</p></div></div>';
    const root = claudeAdapter.messageRoot(document.querySelector('p')!.firstChild!)!;
    expect(root.id).toBe('a2');
    expect(claudeAdapter.messageRole(root)).toBe('assistant');
    expect(claudeAdapter.messageId(root)).toBe('a2');
  });

  it('解析 Gemini 模型消息', () => {
    document.body.innerHTML = '<model-response id="r1"><p>answer</p></model-response>';
    const root = geminiAdapter.messageRoot(document.querySelector('p')!.firstChild!)!;
    expect(geminiAdapter.messageRole(root)).toBe('assistant');
  });

  it('Gemini 对话容器不会生成重复 unknown 节点', () => {
    document.body.innerHTML = '<div class="conversation-container"><user-query id="u1">问题</user-query><model-response id="a1">回答</model-response></div>';
    const roots = geminiAdapter.contentRoots();
    expect(roots.map(root => root.id)).toEqual(['u1', 'a1']);
    expect(roots.map(root => geminiAdapter.messageRole(root))).toEqual(['user', 'assistant']);
  });

  it('识别 ChatGPT 全屏研究报告正文', () => {
    document.body.innerHTML = '<div role="dialog"><article><div role="document"><h1>研究报告</h1><p>可摘录的报告结论</p></div></article></div>';
    const root = chatgptAdapter.messageRoot(document.querySelector('p')!.firstChild!)!;
    expect(root.tagName).toBe('ARTICLE');
    expect(chatgptAdapter.messageRole(root)).toBe('assistant');
    expect(chatgptAdapter.messageId(root)).toMatch(/^report:/);
    expect(chatgptAdapter.findMessage(chatgptAdapter.messageId(root))).toBe(root);
    expect(chatgptAdapter.contentRoots()).toEqual([root]);
  });

  it('识别 Claude Research 成果视图并排除导航', () => {
    document.body.innerHTML = '<nav><div role="document">目录文字</div></nav><section data-testid="research-report"><div role="document"><h1>研究成果</h1><p>Claude 报告正文</p></div></section>';
    expect(claudeAdapter.messageRoot(document.querySelector('nav div')!.firstChild!)).toBeNull();
    const root = claudeAdapter.messageRoot(document.querySelector('p')!.firstChild!)!;
    expect(root.dataset.testid).toBe('research-report');
    expect(claudeAdapter.messageRole(root)).toBe('assistant');
    expect(claudeAdapter.contentRoots()).toEqual([root]);
  });

  it('识别 Gemini Canvas 中的研究报告', () => {
    document.body.innerHTML = '<canvas-panel><div role="document"><h1>Deep Research</h1><p>Gemini 报告正文</p></div></canvas-panel>';
    const root = geminiAdapter.messageRoot(document.querySelector('p')!.firstChild!)!;
    expect(root.tagName.toLowerCase()).toBe('canvas-panel');
    expect(geminiAdapter.messageRole(root)).toBe('assistant');
    expect(geminiAdapter.contentRoots()).toEqual([root]);
  });

  it('Gemini 带消息标识的外层与自定义元素只生成一个节点', () => {
    document.body.innerHTML = '<div data-message-id="g1"><model-response><p>回答</p></model-response></div>';
    const roots = geminiAdapter.contentRoots();
    expect(roots).toHaveLength(1);
    expect(geminiAdapter.messageId(roots[0]!)).toBe('g1');
    expect(geminiAdapter.messageRole(roots[0]!)).toBe('assistant');
  });
});
