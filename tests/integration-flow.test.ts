import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../lib/markdown';
import { addCapture, assignPending, createNotebook, loadState, reorderClips, updateClip } from '../lib/storage';
import type { CapturePayload, Platform } from '../lib/models';

let bucket: Record<string, unknown>;

beforeEach(() => {
  bucket = {};
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: vi.fn(async (key: string) => ({ [key]: bucket[key] })),
      set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(bucket, value); })
    }}
  });
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `${Math.random()}`) });
});

const capture = (platform: Platform, text: string): CapturePayload => ({
  originalText: text, platform, conversationTitle: `${platform} 对话`,
  conversationUrl: `https://${platform}.example/conversation`, conversationId: platform,
  messageRole: 'assistant',
  anchor: { exact: text, prefix: '', suffix: '', messageRole: 'assistant', startOffset: 0, endOffset: text.length, status: 'resolved' }
});

describe('本地核心闭环', () => {
  it('跨平台待分配、批注、排序并导出 Markdown', async () => {
    await addCapture(capture('chatgpt', '第一条'));
    await addCapture(capture('claude', '第二条'));
    const notebook = await createNotebook('跨平台研究');
    await assignPending(notebook.id);
    await addCapture(capture('gemini', '第三条'));

    let state = await loadState();
    const ids = state.notebooks[notebook.id]!.clipIds;
    expect(ids).toHaveLength(3);
    await updateClip(ids[0]!, { annotation: '个人判断' });
    await reorderClips(notebook.id, [...ids].reverse());

    state = await loadState();
    const current = state.notebooks[notebook.id]!;
    const clips = current.clipIds.map(id => state.clips[id]!);
    const markdown = renderMarkdown(current, clips);
    expect(clips.map(item => item.platform)).toEqual(['gemini', 'claude', 'chatgpt']);
    expect(markdown).toContain('个人判断');
    expect(markdown.indexOf('第三条')).toBeLessThan(markdown.indexOf('第一条'));
  });
});
