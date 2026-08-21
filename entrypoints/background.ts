import { addCapture, updateState } from '../lib/storage';
import { isCapturePayload, type ExtensionMessage } from '../lib/messages';

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    if (message?.version !== 1) return;
    if (message.type === 'FOCUS_CLIP') {
      if (sender.tab?.id !== undefined) void chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined);
      void chrome.storage.session.set({ dialogueClipperFocusRequest: { clipId: message.clipId, requestedAt: Date.now() } });
      return;
    }
    if (message.type === 'UPDATE_ANCHOR_STATUSES') {
      void updateState(state => {
        for (const [clipId, status] of Object.entries(message.statuses)) {
          const clip = state.clips[clipId];
          if (clip && (status === 'resolved' || status === 'unresolved')) clip.anchor.status = status;
        }
      });
      return;
    }
    if (message.type !== 'CAPTURE_SELECTION' || !isCapturePayload(message.payload)) return;
    void addCapture(message.payload).then(async result => {
      if (result.pending && sender.tab?.id !== undefined) {
        await chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined);
      }
      sendResponse({ version: 1, type: 'CAPTURE_RESULT', ok: true, ...result } satisfies ExtensionMessage);
    }).catch(error => sendResponse({ version: 1, type: 'CAPTURE_RESULT', ok: false, error: String(error) } satisfies ExtensionMessage));
    return true;
  });

  chrome.commands.onCommand.addListener(async command => {
    if (command !== 'capture-selection') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) await chrome.tabs.sendMessage(tab.id, { version: 1, type: 'CAPTURE_CURRENT_SELECTION' } satisfies ExtensionMessage).catch(() => undefined);
  });
});
