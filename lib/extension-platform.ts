const FOCUS_REQUEST_KEY = 'dialogueClipperFocusRequest';

type SafariCompatibleChrome = typeof chrome & {
  sidePanel?: {
    setPanelBehavior?: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
    open?: (options: { tabId: number }) => Promise<void>;
  };
  downloads?: typeof chrome.downloads;
};

export interface FocusRequest {
  clipId: string;
  requestedAt: number;
}

function extensionApi(): SafariCompatibleChrome {
  return globalThis.chrome as SafariCompatibleChrome;
}

function focusStorage(): chrome.storage.StorageArea {
  const storage = extensionApi().storage;
  const session = (storage as typeof storage & { session?: chrome.storage.StorageArea }).session;
  return session ?? storage.local;
}

export async function openWorkspace(tabId?: number): Promise<void> {
  const api = extensionApi();
  if (tabId !== undefined && typeof api.sidePanel?.open === 'function') {
    await api.sidePanel.open({ tabId });
    return;
  }

  // Safari has no sidePanel API. The toolbar action opens popup.html as a
  // popup; background-triggered focus requests use a normal extension tab.
  if (typeof api.tabs?.create === 'function' && typeof api.runtime?.getURL === 'function') {
    const workspacePage = typeof api.sidePanel?.open === 'function' ? 'sidepanel.html' : 'popup.html';
    await api.tabs.create({ url: api.runtime.getURL(workspacePage), active: true });
  }
}

export async function saveFocusRequest(request: FocusRequest): Promise<void> {
  await focusStorage().set({ [FOCUS_REQUEST_KEY]: request });
}

export async function readFocusRequest(): Promise<unknown> {
  const result = await focusStorage().get(FOCUS_REQUEST_KEY);
  return result[FOCUS_REQUEST_KEY];
}

export async function clearFocusRequest(): Promise<void> {
  await focusStorage().remove(FOCUS_REQUEST_KEY);
}

export function focusRequestKey(): string {
  return FOCUS_REQUEST_KEY;
}

export async function localStorageBytes(): Promise<number> {
  const local = extensionApi().storage.local;
  if (typeof local.getBytesInUse === 'function') return local.getBytesInUse();
  const contents = await local.get(null);
  return new Blob([JSON.stringify(contents)]).size;
}

export async function downloadTextFile(url: string, filename: string): Promise<void> {
  const api = extensionApi();
  if (typeof api.downloads?.download === 'function') {
    await api.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: true });
    return;
  }

  // Safari does not expose chrome.downloads in a web extension. A user
  // initiated anchor download works in both Safari and the Safari popup.
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
}
