import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationMap } from '../entrypoints/sidepanel/ConversationMap';
import { buildConversationTurns, filterConversationTurns } from '../lib/conversation-navigation';
import { buildConversationSnapshot, conversationTextFingerprint, type ConversationGraphNode } from '../lib/conversation-graph';
import type { ExtensionMessage } from '../lib/messages';
import type { Clip } from '../lib/models';

const node = (id: string, order: number, role: ConversationGraphNode['role'], clipIds: string[] = []): ConversationGraphNode => ({
  id, order, role, title: id, text: `${id} original text`, searchText: `${id} original text`,
  fingerprint: conversationTextFingerprint(id), clipIds, isReport: false
});
const messages = [node('q1', 0, 'user'), node('a1', 1, 'assistant'), node('q2', 2, 'user'), node('a2', 3, 'assistant', ['clip2'])];
const initialSnapshot = () => buildConversationSnapshot({ platform: 'chatgpt', conversationId: 'qa', conversationUrl: 'https://chatgpt.com/c/qa', conversationTitle: 'Test conversation' }, messages, 'a1');

describe('conversation directory grouping', () => {
  it('keeps the question with a filtered answer and retains original round numbers', () => {
    const turns = buildConversationTurns(messages);
    expect(filterConversationTurns(turns, true, '')).toMatchObject([{ number: 2, messages: [{ id: 'q2' }, { id: 'a2' }] }]);
    expect(filterConversationTurns(turns, false, 'a2')).toMatchObject([{ number: 2, question: { id: 'q2' }, answer: { id: 'a2' } }]);
    expect(turns[0]!.messages.map(message => message.id)).toEqual(['q1', 'a1']);
  });
  it('does not pair across gaps, repeated answers or unknown messages', () => {
    const turns = buildConversationTurns([node('q', 0, 'user'), node('a', 3, 'assistant'), node('a2', 4, 'assistant'), node('x', 5, 'unknown'), node('q2', 6, 'user')]);
    expect(turns).toHaveLength(5);
    expect(turns[0]!.answer).toBeUndefined();
    expect(turns[1]!.question).toBeUndefined();
    expect(turns[4]!.answer).toBeUndefined();
    expect(buildConversationTurns([])).toEqual([]);
  });
});

describe('conversation directory interactions', () => {
  let root: Root;
  let container: HTMLDivElement;
  let snapshot = initialSnapshot();
  let bridge: ReturnType<typeof vi.fn>;
  let listener: ((message: ExtensionMessage, sender: chrome.runtime.MessageSender) => void) | undefined;
  const onShowClips = vi.fn();
  const onFocusHandled = vi.fn();

  beforeEach(() => {
    snapshot = initialSnapshot();
    listener = undefined;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
    bridge = vi.fn(async (_tabId, message) => message.type === 'GET_CONVERSATION_GRAPH'
      ? { version: 2, type: 'CONVERSATION_GRAPH_RESULT', ok: true, snapshot }
      : message.type === 'SCROLL_TO_CONVERSATION_NODE'
        ? { version: 2, type: 'SCROLL_TO_CONVERSATION_NODE_RESULT', ok: true }
        : undefined);
    vi.stubGlobal('chrome', {
      tabs: { get: vi.fn(async () => ({ id: 7, url: snapshot.conversationUrl })), query: vi.fn(async () => [{ id: 7, url: snapshot.conversationUrl }]), update: vi.fn(async () => ({})), sendMessage: bridge, onActivated: event(), onUpdated: event() },
      runtime: { onMessage: { addListener: (value: typeof listener) => { listener = value; }, removeListener: vi.fn() } }
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onShowClips.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  const render = async (active = true) => {
    await act(async () => root.render(createElement(ConversationMap, { active, onShowClips, onFocusHandled })));
  };
  const click = async (element: Element | null) => {
    expect(element).not.toBeNull();
    await act(async () => (element as HTMLElement).click());
  };
  const rows = () => [...container.querySelectorAll('.conversation-turn')];
  const detail = () => container.querySelector('.conversation-detail')!;

  it('defaults to source structure, toggles original text and resets the preview on message changes', async () => {
    snapshot = { ...snapshot, nodes: snapshot.nodes.map(message => message.id === 'a2' ? { ...message, outline: { items: [
      { kind: 'heading' as const, level: 2, text: '总体框架' }, { kind: 'emphasis' as const, level: 3, text: '保留来源' }
    ], truncated: false } } : message) };
    await render();
    await click(rows()[1]!);
    expect(container.querySelector('.conversation-outline')?.textContent).toContain('总体框架');
    expect(container.querySelector('.conversation-detail-text')).toBeNull();
    expect((container.querySelector('.conversation-outline li:last-child') as HTMLElement).style.paddingInlineStart).toBe('12px');
    await click(container.querySelector('.conversation-preview-toggle'));
    expect(container.querySelector('.conversation-detail-text')?.textContent).toBe('a2 original text');
    await click(container.querySelector('.conversation-message-switch button'));
    expect(container.querySelector('.conversation-detail-text')?.textContent).toBe('q2 original text');
    await click(container.querySelector('.conversation-message-switch button:last-child'));
    expect(container.querySelector('.conversation-outline')?.textContent).toContain('保留来源');
    expect(bridge.mock.calls.some(([, message]) => message.type === 'SCROLL_TO_CONVERSATION_NODE')).toBe(false);
  });

  it('previews a different round without moving the source; explicitly locates the selected role', async () => {
    await render();
    await click(rows()[1]!);
    expect(detail().textContent).toContain('a2 original text');
    expect(rows()[0]!.getAttribute('aria-current')).toBe('location');
    expect(rows()[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(bridge.mock.calls.some(([, message]) => message.type === 'SCROLL_TO_CONVERSATION_NODE')).toBe(false);
    await click(container.querySelector('.conversation-message-switch button'));
    expect(detail().textContent).toContain('q2 original text');
    await click(container.querySelector('.conversation-locate'));
    expect(bridge).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'SCROLL_TO_CONVERSATION_NODE', nodeId: 'q2', locator: expect.objectContaining({ role: 'user', order: 2 }) }));
    expect(rows()[1]!.getAttribute('aria-current')).toBe('location');
  });
  it('preserves preview when page reading position changes', async () => {
    await render();
    await click(rows()[1]!);
    await act(async () => listener?.({ version: 2, type: 'CONVERSATION_ACTIVE_NODE', nodeId: 'q1', conversationUrl: snapshot.conversationUrl }, { tab: { id: 7 } } as chrome.runtime.MessageSender));
    expect(detail().textContent).toContain('a2 original text');
    expect(rows()[0]!.getAttribute('aria-current')).toBe('location');
  });
  it('keeps selected role while leaving and returning to the conversation view', async () => {
    await render();
    await click(rows()[1]!);
    await click(container.querySelector('.conversation-message-switch button'));
    await render(false);
    await render(true);
    expect(detail().textContent).toContain('q2 original text');
    expect(container.querySelector('.conversation-message-switch button')!.getAttribute('aria-pressed')).toBe('true');
  });
  it('reports a failed source jump without falsely moving the source marker', async () => {
    await render();
    await click(rows()[1]!);
    bridge.mockImplementation(async (_tabId, message) => message.type === 'SCROLL_TO_CONVERSATION_NODE'
      ? { version: 2, type: 'SCROLL_TO_CONVERSATION_NODE_RESULT', ok: false, error: 'changed' } : undefined);
    await click(container.querySelector('.conversation-locate'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('changed');
    expect(rows()[0]!.getAttribute('aria-current')).toBe('location');
    expect((container.querySelector('.conversation-locate') as HTMLButtonElement).disabled).toBe(false);
  });
  it('handles an empty snapshot without crashing', async () => {
    snapshot = { ...snapshot, nodes: [], edges: [], activeNodeId: undefined };
    await render();
    expect(container.textContent).toContain('no messages');
    expect(rows()).toHaveLength(0);
  });

  it('opens the chosen excerpt by its exact id, and groups all excerpts only on the group action', async () => {
    snapshot = { ...snapshot, nodes: snapshot.nodes.map(message => message.id === 'a2' ? { ...message, clipIds: ['clip2', 'clip3'] } : message) };
    const clipsById: Record<string, Clip> = Object.fromEntries(['clip2', 'clip3'].map(id => [id, {
      id, notebookId: 'notebook', originalText: `Exact excerpt ${id}`, annotation: '',
      platform: 'chatgpt', conversationTitle: snapshot.conversationTitle, conversationUrl: snapshot.conversationUrl, conversationId: snapshot.conversationId,
      messageRole: 'assistant', capturedAt: '2026-09-07T00:00:00Z', highlightColor: 'green',
      anchor: { exact: `Exact excerpt ${id}`, prefix: '', suffix: '', messageRole: 'assistant', startOffset: 0, endOffset: 20, status: 'resolved' }
    }]));
    await act(async () => root.render(createElement(ConversationMap, { clipsById, onShowClips, onFocusHandled })));
    await click(rows()[1]!);
    await click(container.querySelectorAll('.conversation-turn-clips li button')[1]!);
    expect(onShowClips).toHaveBeenLastCalledWith(['clip3']);
    await click(container.querySelector('.conversation-detail-actions button:last-child'));
    expect(onShowClips).toHaveBeenLastCalledWith(['clip2', 'clip3']);
  });
});
