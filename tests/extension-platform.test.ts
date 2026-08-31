import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFocusRequest, downloadTextFile, localStorageBytes, openWorkspace, readFocusRequest, saveFocusRequest
} from '../lib/extension-platform';

describe('extension platform compatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('在 Safari 没有 storage.session 时把焦点请求保存到 local', async () => {
    const bucket: Record<string, unknown> = {};
    const local = {
      get: vi.fn(async (key: string | null) => key === null ? bucket : { [key]: bucket[key] }),
      set: vi.fn(async (value: Record<string, unknown>) => Object.assign(bucket, value)),
      remove: vi.fn(async (key: string) => { delete bucket[key]; })
    };
    vi.stubGlobal('chrome', { storage: { local } });

    await saveFocusRequest({ clipId: 'clip-1', requestedAt: 1 });
    expect(await readFocusRequest()).toEqual({ clipId: 'clip-1', requestedAt: 1 });
    await clearFocusRequest();
    expect(await readFocusRequest()).toBeUndefined();
  });

  it('Safari 没有 downloads API 时使用网页下载链接', async () => {
    const anchor = document.createElement('a');
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('chrome', { storage: { local: { get: vi.fn() } } });
    vi.spyOn(document, 'createElement').mockReturnValue(anchor as unknown as HTMLElement);

    await downloadTextFile('blob:test', 'note.md');
    expect(anchor.href).toBe('blob:test');
    expect(anchor.download).toBe('note.md');
    expect(click).toHaveBeenCalledOnce();
  });

  it('没有 getBytesInUse 时按 local 存储内容估算占用', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({ note: '摘录' })) } }
    });

    expect(await localStorageBytes()).toBe(new Blob([JSON.stringify({ note: '摘录' })]).size);
  });

  it('Safari 后台触发工作区时打开扩展页标签', async () => {
    const create = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      runtime: { getURL: vi.fn((path: string) => `safari-extension://${path}`) },
      tabs: { create },
      storage: { local: { get: vi.fn() } }
    });

    await openWorkspace();
    expect(create).toHaveBeenCalledWith({ url: 'safari-extension://popup.html', active: true });
  });
});
