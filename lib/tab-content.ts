import type { ExtensionMessage } from './messages';

const RETRY_DELAY_MS = 250;
const injectionByTab = new Map<number, Promise<void>>();

/**
 * Sends a message to a supported page and repairs the common MV3 case where
 * an already-open tab lost its content script after the extension reloaded.
 */
export async function sendContentMessage(
  tabId: number,
  message: ExtensionMessage,
  attempts = 8
): Promise<ExtensionMessage | undefined> {
  let lastError: unknown;
  let injectionAttempted = false;
  const responseRequired = message.type === 'GET_CONVERSATION_GRAPH' || message.type === 'GET_CONVERSATION_EXPORT' ||
    message.type === 'SCROLL_TO_CONVERSATION_NODE' || message.type === 'SCROLL_TO_CLIP';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message) as ExtensionMessage | undefined;
      // A stale listener left behind by an extension reload can receive the
      // message but deliberately ignore the newer protocol. Chrome resolves
      // that send with undefined, so treat it like a missing receiver.
      if (responseRequired && response === undefined) throw new Error('The conversation bridge did not respond');
      return response;
    } catch (error) {
      lastError = error;
      if (!injectionAttempted) {
        injectionAttempted = true;
        await injectRegisteredContentScript(tabId);
      }
    }
    if (attempt + 1 < attempts) await delay(RETRY_DELAY_MS);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Unable to reach the conversation page'));
}

async function injectRegisteredContentScript(tabId: number): Promise<void> {
  const activeInjection = injectionByTab.get(tabId);
  if (activeInjection) return activeInjection;
  const injection = performContentScriptInjection(tabId);
  injectionByTab.set(tabId, injection);
  try {
    await injection;
  } finally {
    if (injectionByTab.get(tabId) === injection) injectionByTab.delete(tabId);
  }
}

async function performContentScriptInjection(tabId: number): Promise<void> {
  if (!chrome.scripting?.executeScript) return;
  const scripts = chrome.runtime.getManifest().content_scripts ?? [];
  const files = [...new Set(scripts.flatMap(script => script.js ?? []))];
  if (!files.length) return;
  await chrome.scripting.executeScript({ target: { tabId }, files });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}
