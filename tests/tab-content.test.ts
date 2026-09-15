import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimContentRuntime } from '../lib/content-runtime';
import { sendContentMessage } from '../lib/tab-content';

describe('content-script recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', {
      tabs: { sendMessage: vi.fn() },
      scripting: { executeScript: vi.fn(async () => undefined) },
      runtime: { getManifest: () => ({ content_scripts: [{ js: ['content.js'] }] }) }
    });
  });

  it('repairs an undefined full-conversation export response', async () => {
    const sendMessage = chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>;
    sendMessage
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ version: 2, type: 'CONVERSATION_EXPORT_RESULT', ok: true, value: {} });

    const result = sendContentMessage(7, { version: 2, type: 'GET_CONVERSATION_EXPORT' }, 2);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ type: 'CONVERSATION_EXPORT_RESULT', ok: true });
    expect(chrome.scripting.executeScript).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent injection attempts for one tab', async () => {
    let releaseInjection!: () => void;
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no receiver'));
    (chrome.scripting.executeScript as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise<void>(resolve => { releaseInjection = resolve; }));

    const first = sendContentMessage(9, { version: 2, type: 'GET_CONVERSATION_GRAPH' }, 1);
    const second = sendContentMessage(9, { version: 2, type: 'GET_CONVERSATION_GRAPH' }, 1);
    await Promise.resolve();
    await Promise.resolve();

    expect(chrome.scripting.executeScript).toHaveBeenCalledOnce();
    releaseInjection();
    await expect(Promise.allSettled([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'rejected' }),
      expect.objectContaining({ status: 'rejected' })
    ]);
  });
});

describe('content runtime claim', () => {
  it('allows one initialization per runtime version', () => {
    const scope: Record<string, unknown> = {};
    expect(claimContentRuntime(scope)).toBe(true);
    expect(claimContentRuntime(scope)).toBe(false);
  });
});
