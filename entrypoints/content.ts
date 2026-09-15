import { createAnchor, locateTextSegments } from '../lib/anchors';
import { currentAdapter } from '../lib/adapters';
import { resolveFloatingPosition, type RectLike } from '../lib/floating-position';
import { chooseHighlightSurface, type HighlightSurface } from '../lib/highlight-theme';
import { isMissingHighlightConfirmed, recordMissingHighlight, type MissingHighlightAttempt } from '../lib/highlight-status';
import {
  attachClipsToConversationNodes, buildConversationSnapshot, conversationNodeId, conversationTextFingerprint, findConversationNodeByLocator, generateConversationNodeTitle, parseBranchInfo,
  type ConversationGraphNode, type ConversationGraphSnapshot, type ConversationNodeLocator
} from '../lib/conversation-graph';
import { conversationElementToMarkdown, type ConversationExport } from '../lib/conversation-export';
import type { Clip, HighlightColor } from '../lib/models';
import type { ExtensionMessage } from '../lib/messages';
import { loadState } from '../lib/storage';
import { isSameConversationUrl } from '../lib/conversation-url';
import { t } from '../lib/i18n';
import { extractConversationOutline } from '../lib/conversation-outline';
import { claimContentRuntime } from '../lib/content-runtime';

const BUTTON_ID = 'dialogue-clipper-capture';
const STYLE_ID = 'dialogue-clipper-styles';
const HIGHLIGHT_ATTR = 'data-dialogue-clip-id';
const GRAPH_LEASE_MS = 120_000;
const MAX_GRAPH_NODES = 600;
const MAX_GRAPH_NODE_TEXT = 20_000;
const MAX_GRAPH_TOTAL_TEXT = 2_000_000;
const MISSING_STATUS_CONFIRMATIONS = 3;
const MISSING_STATUS_GRACE_MS = 1_200;

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*'],
  runAt: 'document_idle',
  main() {
    if (!claimContentRuntime(globalThis as unknown as Record<string, unknown>)) return;
    const adapter = currentAdapter();
    if (!adapter) return;
    const activeAdapter = adapter;

    injectStyles();
    const button = createCaptureButton();
    let lastRange: Range | null = null;
    let refreshTimer: number | undefined;
    let refreshPromise: Promise<void> | undefined;
    let refreshQueued = false;
    let conversationRefreshTimer: number | undefined;
    let activeNodeTimer: number | undefined;
    let graphLeaseUntil = 0;
    let pageGeneration = 0;
    let scanPromise: Promise<ConversationGraphSnapshot> | undefined;
    let lastConversationRevision = '';
    let lastActiveNodeId: string | undefined;
    let conversationNodeUrl = '';
    let conversationNodeElements = new Map<string, HTMLElement>();
    const missingStatusAttempts = new Map<string, MissingHighlightAttempt>();
    const positionTimers = new Set<number>();
    let captureInFlight = false;

    const showButton = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return hideButton();
      const range = selection.getRangeAt(0);
      const text = range.toString().trim();
      if (!text) return hideButton();
      const startMessage = activeAdapter.messageRoot(range.startContainer);
      const endMessage = activeAdapter.messageRoot(range.endContainer);
      if (!startMessage || startMessage !== endMessage) return hideButton();
      lastRange = range.cloneRange();
      button.hidden = false;
      positionButton(range);
      clearPositionTimers();
      // ChatGPT mounts its native selection toolbar into a top-layer popover
      // asynchronously. Re-check across its opening animation so it cannot
      // cover the clip button after our first placement.
      if (activeAdapter.platform === 'chatgpt') {
        [40, 100, 180, 320, 500].forEach(delay => {
          const timer = window.setTimeout(() => {
            positionTimers.delete(timer);
            if (!button.hidden && lastRange) positionButton(lastRange);
          }, delay);
          positionTimers.add(timer);
        });
      }
    };

    const clearPositionTimers = () => {
      positionTimers.forEach(timer => window.clearTimeout(timer));
      positionTimers.clear();
    };

    const hideButton = () => {
      button.hidden = true;
      clearPositionTimers();
    };

    const positionButton = (range: Range) => {
      const selectionRect = range.getBoundingClientRect();
      const controls = collectNearbyControls(button);
      const position = resolveFloatingPosition(selectionRect, controls, { width: window.innerWidth, height: window.innerHeight });
      button.style.left = `${position.left}px`;
      button.style.top = `${position.top}px`;
    };

    const capture = async () => {
      if (captureInFlight) return;
      captureInFlight = true;
      button.disabled = true;
      try {
        const selection = window.getSelection();
        let range: Range | undefined;
        let message: HTMLElement | null = null;
        const liveRange = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : undefined;
        if (liveRange?.startContainer.isConnected && liveRange.endContainer.isConnected) {
          const startMessage = activeAdapter.messageRoot(liveRange.startContainer);
          const endMessage = activeAdapter.messageRoot(liveRange.endContainer);
          if (startMessage || endMessage) {
            if (!startMessage || startMessage !== endMessage) {
              return toast(t('multipleMessagesError'), 'error');
            }
            range = liveRange.cloneRange();
            message = startMessage;
          }
        }
        if (!range && lastRange?.startContainer.isConnected && lastRange.endContainer.isConnected) {
          const lastMessage = activeAdapter.messageRoot(lastRange.startContainer);
          if (lastMessage && lastMessage === activeAdapter.messageRoot(lastRange.endContainer)) {
            range = lastRange.cloneRange();
            message = lastMessage;
          }
        }
        if (!range || !message) return toast(t('selectTextFirst'), 'error');
        const originalText = range.toString();
        if (!originalText.trim()) return toast(t('selectionEmpty'), 'error');

        let response: ExtensionMessage | undefined;
        try {
          const role = activeAdapter.messageRole(message);
          const metadata = activeAdapter.metadata();
          const anchor = createAnchor(range, message, role, activeAdapter.messageId(message));
          response = await chrome.runtime.sendMessage({
            version: 1,
            type: 'CAPTURE_SELECTION',
            payload: { originalText, ...metadata, messageRole: role, anchor }
          } satisfies ExtensionMessage) as ExtensionMessage | undefined;
        } catch {
          return toast(t('saveClipReload'), 'error');
        }
        hideButton();
        selection?.removeAllRanges();
        if (response?.type !== 'CAPTURE_RESULT' || !response.ok) return toast(t('saveClipTryAgain'), 'error');
        if (response.clip) {
          if (!highlightClip(response.clip)) scheduleRefresh(0);
          toast(t('addedToNotebook'));
        } else {
          toast(t('selectNotebookToSave'));
        }
      } finally {
        captureInFlight = false;
        button.disabled = false;
      }
    };

    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => void capture());
    document.addEventListener('selectionchange', () => window.setTimeout(showButton, 0));
    document.addEventListener('mousedown', event => {
      if (event.target !== button) hideButton();
    });
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area !== 'local') return;
      scheduleRefresh(80);
      if (isGraphTracking()) scheduleConversationRefresh(120);
    });

    const scheduleRefresh = (delay = 300) => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshHighlights(), delay);
    };

    const scheduleConversationRefresh = (delay = 450) => {
      if (!isGraphTracking()) return;
      window.clearTimeout(conversationRefreshTimer);
      conversationRefreshTimer = window.setTimeout(() => {
        if (isGraphTracking()) void publishConversationGraph();
      }, delay);
    };

    const scheduleActiveNodeRefresh = () => {
      if (!isGraphTracking()) return;
      window.clearTimeout(activeNodeTimer);
      activeNodeTimer = window.setTimeout(() => publishActiveConversationNode(), 100);
    };

    const scanConversationGraph = async (): Promise<ConversationGraphSnapshot> => {
      if (!activeAdapter.isConversation()) throw new Error('This page is not a supported conversation');
      const generation = pageGeneration;
      const state = await loadState();
      if (generation !== pageGeneration || !activeAdapter.isConversation()) throw new Error('The page changed');
      const metadata = activeAdapter.metadata();
      const pageClips = Object.values(state.clips).filter(clip => clipMatchesConversation(clip, metadata));
      const elements = new Map<string, HTMLElement>();
      const fullTextByNodeId = new Map<string, string>();
      const rawNodes: ConversationGraphNode[] = [];
      let remainingText = MAX_GRAPH_TOTAL_TEXT;
      const roots = activeAdapter.contentRoots().filter(root => root.isConnected).slice(0, MAX_GRAPH_NODES);
      for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
        const root = roots[rootIndex]!;
        const fullText = normalizeMessageText(root);
        if (!fullText) continue;
        const remainingRoots = roots.length - rootIndex - 1;
        const outline = extractConversationOutline(root, Math.min(4000, Math.max(0, remainingText - (remainingRoots + 1) * 420)));
        remainingText -= outline.items.reduce((sum, item) => sum + item.text.length, 0);
        const reservedPreviewText = Math.min(remainingText, remainingRoots * 420);
        const searchText = fullText.slice(0, Math.min(MAX_GRAPH_NODE_TEXT, Math.max(0, remainingText - reservedPreviewText)));
        remainingText -= searchText.length;
        const order = rawNodes.length;
        const messageId = activeAdapter.messageId(root);
        const role = activeAdapter.messageRole(root);
        const id = conversationNodeId(metadata.conversationId, messageId, role, order);
        elements.set(id, root);
        fullTextByNodeId.set(id, fullText);
        rawNodes.push({
          id,
          messageId,
          role,
          title: generateConversationNodeTitle(fullText),
          text: searchText.length > 420 ? `${searchText.slice(0, 419)}…` : searchText,
          searchText,
          outline,
          fingerprint: conversationTextFingerprint(searchText),
          order,
          clipIds: [],
          branch: parseBranchInfo(root),
          isReport: Boolean(messageId?.startsWith('report:'))
        });
      }
      if (generation !== pageGeneration || metadata.conversationUrl !== activeAdapter.metadata().conversationUrl) throw new Error('The page changed');
      const nodes = attachClipsToConversationNodes(rawNodes, pageClips, fullTextByNodeId);
      conversationNodeElements = elements;
      conversationNodeUrl = metadata.conversationUrl;
      const activeNodeId = findActiveConversationNode(elements);
      lastActiveNodeId = activeNodeId;
      return buildConversationSnapshot(metadata, nodes, activeNodeId);
    };

    const getConversationGraph = (): Promise<ConversationGraphSnapshot> => {
      if (scanPromise) return scanPromise;
      const pending = scanConversationGraph();
      const tracked = pending.finally(() => {
        if (scanPromise === tracked) scanPromise = undefined;
      });
      scanPromise = tracked;
      return tracked;
    };

    const buildConversationExport = (): ConversationExport => {
      if (!activeAdapter.isConversation()) throw new Error(t('openConversationFirst'));
      const metadata = activeAdapter.metadata();
      const messages = activeAdapter.contentRoots()
        .filter(root => root.isConnected)
        .slice(0, MAX_GRAPH_NODES)
        .map((root, order) => {
          const role = activeAdapter.messageRole(root);
          const messageId = activeAdapter.messageId(root);
          return {
            id: conversationNodeId(metadata.conversationId, messageId, role, order),
            role,
            markdown: conversationElementToMarkdown(root),
            order,
            isReport: Boolean(messageId?.startsWith('report:'))
          };
        })
        .filter(message => message.markdown.trim());
      return {
        version: 1,
        ...metadata,
        messages,
        scope: 'current-visible-branch',
        capturedAt: new Date().toISOString()
      };
    };

    const publishConversationGraph = async () => {
      try {
        const snapshot = await getConversationGraph();
        if (!isGraphTracking()) return;
        if (snapshot.revision === lastConversationRevision) {
          publishActiveConversationNode();
          return;
        }
        lastConversationRevision = snapshot.revision;
        await chrome.runtime.sendMessage({ version: 2, type: 'CONVERSATION_GRAPH_UPDATED', snapshot } satisfies ExtensionMessage).catch(() => undefined);
      } catch {
        // The page may be replacing a message while the scan is running.
      }
    };

    const publishActiveConversationNode = () => {
      if (!isGraphTracking() || !conversationNodeElements.size || conversationNodeUrl !== activeAdapter.metadata().conversationUrl) return;
      const nodeId = findActiveConversationNode(conversationNodeElements);
      if (nodeId === lastActiveNodeId) return;
      lastActiveNodeId = nodeId;
      void chrome.runtime.sendMessage({
        version: 2,
        type: 'CONVERSATION_ACTIVE_NODE',
        conversationUrl: activeAdapter.metadata().conversationUrl,
        nodeId
      } satisfies ExtensionMessage).catch(() => undefined);
    };

    const refreshHighlights = async () => {
      if (refreshPromise) {
        refreshQueued = true;
        return refreshPromise;
      }
      const run = (async () => {
        // Keep existing marks in place while storage is being read. The old
        // implementation removed every mark before this await, which made
        // the source text visibly blink on every page mutation.
        const state = await loadState();
        const activeConversation = activeAdapter.isConversation();
        const metadata = activeConversation ? activeAdapter.metadata() : undefined;
        const pageClips = metadata
          ? Object.values(state.clips).filter(clip => clipMatchesConversation(clip, metadata))
          : [];
        const pageClipIds = new Set(pageClips.map(clip => clip.id));
        const statusUpdates: Record<string, 'resolved' | 'unresolved'> = {};
        const now = Date.now();

        observer.disconnect();
        try {
          // Only remove marks which no longer belong on this conversation.
          // Existing marks are reconciled in place by highlightClip().
          document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTR}]`).forEach(mark => {
            if (!pageClipIds.has(mark.getAttribute(HIGHLIGHT_ATTR) ?? '')) unwrapHighlight(mark);
          });

          for (const clip of pageClips) {
            const resolved = highlightClip(clip);
            if (resolved) {
              missingStatusAttempts.delete(clip.id);
              if (clip.anchor.status !== 'resolved') statusUpdates[clip.id] = 'resolved';
              continue;
            }

            const attempt = recordMissingHighlight(missingStatusAttempts.get(clip.id), now);
            missingStatusAttempts.set(clip.id, attempt);
            const confirmedMissing = isMissingHighlightConfirmed(attempt, now, MISSING_STATUS_CONFIRMATIONS, MISSING_STATUS_GRACE_MS);
            if (confirmedMissing && clip.anchor.status !== 'unresolved') statusUpdates[clip.id] = 'unresolved';
          }
          for (const clipId of missingStatusAttempts.keys()) {
            if (!pageClipIds.has(clipId)) missingStatusAttempts.delete(clipId);
          }
        } finally {
          observer.observe(document.body, { childList: true, subtree: true });
        }

        if (Object.keys(statusUpdates).length) {
          await chrome.runtime.sendMessage({ version: 1, type: 'UPDATE_ANCHOR_STATUSES', statuses: statusUpdates } satisfies ExtensionMessage).catch(() => undefined);
        }
      })();
      refreshPromise = run;
      try {
        await run;
      } finally {
        if (refreshPromise === run) refreshPromise = undefined;
        if (refreshQueued) {
          refreshQueued = false;
          scheduleRefresh(120);
        }
      }
    };

    const scrollToClip = async (clipId: string): Promise<{ ok: boolean; exact: boolean }> => {
      const state = await loadState();
      const clip = state.clips[clipId];
      if (!clip || !clipMatchesConversation(clip, activeAdapter.metadata())) {
        toast(t('sourceTextNotFound'), 'error');
        return { ok: false, exact: false };
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        highlightClip(clip);
        const marks = Array.from(document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTR}="${CSS.escape(clipId)}"]`));
        if (marks.length) {
          marks[0]!.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          marks.forEach(pulseElement);
          toast(t('openedSourceText'));
          return { ok: true, exact: true };
        }
        const message = activeAdapter.findMessage(clip.anchor.messageId)
          ?? findUniqueMessage(clip.anchor.exact, clip.messageRole);
        if (message) {
          message.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          pulseElement(message);
          toast(t('openedSourceMessageImprecise'), 'error');
          return { ok: true, exact: false };
        }
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
      toast(t('pageChangedSource'), 'error');
      return { ok: false, exact: false };
    };

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (!message || (message.version !== 1 && message.version !== 2)) return;
      const navigationMessage = message.type === 'START_CONVERSATION_GRAPH' || message.type === 'STOP_CONVERSATION_GRAPH' ||
        message.type === 'GET_CONVERSATION_GRAPH' || message.type === 'GET_CONVERSATION_EXPORT' ||
        message.type === 'SCROLL_TO_CONVERSATION_NODE' || message.type === 'SCROLL_TO_CLIP';
      if (navigationMessage && message.version !== 2) return;
      if (message.type === 'START_CONVERSATION_GRAPH') {
        graphLeaseUntil = Date.now() + GRAPH_LEASE_MS;
        scheduleConversationRefresh(0);
      }
      if (message.type === 'STOP_CONVERSATION_GRAPH') {
        graphLeaseUntil = 0;
        pageGeneration += 1;
        scanPromise = undefined;
        window.clearTimeout(conversationRefreshTimer);
        window.clearTimeout(activeNodeTimer);
        conversationNodeElements.clear();
        conversationNodeUrl = '';
      }
      if (message.type === 'GET_CONVERSATION_GRAPH') {
        graphLeaseUntil = Date.now() + GRAPH_LEASE_MS;
        void getConversationGraph().then(snapshot => sendResponse({
          version: 2,
          type: 'CONVERSATION_GRAPH_RESULT',
          ok: true,
          snapshot
        } satisfies ExtensionMessage)).catch(error => sendResponse({
          version: 2,
          type: 'CONVERSATION_GRAPH_RESULT',
          ok: false,
          error: String(error)
        } satisfies ExtensionMessage));
        return true;
      }
      if (message.type === 'GET_CONVERSATION_EXPORT') {
        try {
          sendResponse({ version: 2, type: 'CONVERSATION_EXPORT_RESULT', ok: true, value: buildConversationExport() } satisfies ExtensionMessage);
        } catch (error) {
          sendResponse({ version: 2, type: 'CONVERSATION_EXPORT_RESULT', ok: false, error: String(error) } satisfies ExtensionMessage);
        }
        return;
      }
      if (message.type === 'SCROLL_TO_CONVERSATION_NODE') {
        void scrollToConversationNode(message.nodeId, message.conversationUrl, message.locator).then(ok => sendResponse({
          version: 2,
          type: 'SCROLL_TO_CONVERSATION_NODE_RESULT',
          ok
        } satisfies ExtensionMessage));
        return true;
      }
      if (message.type === 'CAPTURE_CURRENT_SELECTION') void capture();
      if (message.type === 'REFRESH_HIGHLIGHTS') scheduleRefresh(0);
      if (message.type === 'SCROLL_TO_CLIP') {
        void scrollToClip(message.clipId).then(result => sendResponse({
          version: 2,
          type: 'SCROLL_TO_CLIP_RESULT',
          ...result
        } satisfies ExtensionMessage));
        return true;
      }
    });

    const scrollToConversationNode = async (nodeId: string, expectedUrl: string, locator: ConversationNodeLocator): Promise<boolean> => {
      if (!activeAdapter.isConversation() || activeAdapter.metadata().conversationUrl !== expectedUrl) return false;
      let element = conversationNodeUrl === expectedUrl ? conversationNodeElements.get(nodeId) : undefined;
      const cachedMatches = element?.isConnected && conversationElementMatchesLocator(element, locator);
      let resolvedNodeId = cachedMatches ? nodeId : undefined;
      if (!cachedMatches) {
        const snapshot = await getConversationGraph();
        const candidate = findConversationNodeByLocator(snapshot.nodes, locator);
        element = candidate ? conversationNodeElements.get(candidate.id) : undefined;
        resolvedNodeId = candidate?.id;
      }
      if (!element) return false;
      scrollMessageStartIntoView(element);
      pulseElement(element);
      lastActiveNodeId = resolvedNodeId ?? nodeId;
      return true;
    };

    function conversationElementMatchesLocator(element: HTMLElement, locator: ConversationNodeLocator): boolean {
      if (!element.isConnected || activeAdapter.messageRole(element) !== locator.role) return false;
      if (locator.messageId) return activeAdapter.messageId(element) === locator.messageId;
      const text = normalizeMessageText(element);
      return conversationTextFingerprint(text.slice(0, MAX_GRAPH_NODE_TEXT)) === locator.fingerprint ||
        Boolean(locator.quote && text.includes(locator.quote));
    }

    function highlightClip(clip: Clip): boolean {
      const createdMarks: HTMLElement[] = [];
      try {
        const existingMarks = Array.from(document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTR}="${CSS.escape(clip.id)}"]`));
        if (existingMarks.length) {
          existingMarks.forEach(mark => updateHighlightMark(mark, clip));
          return true;
        }
        const root = activeAdapter.findMessage(clip.anchor.messageId)
          ?? findUniqueMessage(clip.anchor.exact, clip.messageRole);
        if (!root) return false;
        const segments = locateTextSegments(root, clip.anchor);
        if (!segments.length) return false;
        for (const located of [...segments].reverse()) {
          if (!located.node.isConnected) throw new Error('The source changed while highlighting');
          const mark = document.createElement('mark');
          mark.setAttribute(HIGHLIGHT_ATTR, clip.id);
          updateHighlightMark(mark, clip, located.node.parentElement ?? root);
          mark.title = t('openClipInSidebar');
          const range = document.createRange();
          range.setStart(located.node, located.start);
          range.setEnd(located.node, located.end);
          range.surroundContents(mark);
          mark.addEventListener('click', () => void chrome.runtime.sendMessage({ version: 1, type: 'FOCUS_CLIP', clipId: clip.id } satisfies ExtensionMessage));
          createdMarks.push(mark);
        }
      } catch {
        createdMarks.forEach(unwrapHighlight);
        return false;
      }
      return true;
    }

    function clipMatchesConversation(clip: Clip, metadata: ReturnType<typeof activeAdapter.metadata>): boolean {
      return clip.platform === metadata.platform && (
        Boolean(clip.conversationId && clip.conversationId === metadata.conversationId) ||
        isSameConversationUrl(clip.conversationUrl, metadata.conversationUrl)
      );
    }

    function findUniqueMessage(exact: string, role: Clip['messageRole']): HTMLElement | null {
      const candidates = activeAdapter.contentRoots()
        .filter(element => activeAdapter.messageRole(element) === role && (element.textContent ?? '').includes(exact))
        .filter((element, _index, roots) => !roots.some(other => other !== element && element.contains(other) && (other.textContent ?? '').includes(exact)));
      return candidates.length === 1 ? candidates[0]! : null;
    }

    const observer = new MutationObserver(() => {
      scheduleRefresh();
      // The native selection menu may be inserted after all timed passes. Its
      // DOM mutation is the authoritative signal to recompute the collision.
      if (!button.hidden && lastRange) positionButton(lastRange);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const graphObserver = new MutationObserver(() => {
      if (isGraphTracking()) scheduleConversationRefresh(700);
    });
    graphObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'role', 'aria-level', 'hidden', 'aria-hidden']
    });
    const themeObserver = new MutationObserver(() => scheduleRefresh(40));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    document.addEventListener('scroll', scheduleActiveNodeRefresh, { capture: true, passive: true });
    let previousUrl = location.href;
    window.setInterval(() => {
      if (location.href === previousUrl) return;
      previousUrl = location.href;
      pageGeneration += 1;
      scanPromise = undefined;
      scheduleRefresh(500);
      lastConversationRevision = '';
      lastActiveNodeId = undefined;
      conversationNodeElements.clear();
      conversationNodeUrl = '';
      void chrome.runtime.sendMessage({
        version: 2,
        type: 'CONVERSATION_GRAPH_CLEARED',
        conversationUrl: activeAdapter.metadata().conversationUrl
      } satisfies ExtensionMessage).catch(() => undefined);
      if (isGraphTracking()) scheduleConversationRefresh(520);
    }, 750);
    scheduleRefresh(250);

    function isGraphTracking(): boolean {
      return graphLeaseUntil > Date.now();
    }
  }
});

function createCaptureButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = t('clip');
  button.hidden = true;
  document.documentElement.append(button);
  return button;
}

function collectNearbyControls(ownButton: HTMLButtonElement): RectLike[] {
  const elements = document.querySelectorAll<HTMLElement>('button, [role="toolbar"], [role="menu"]');
  const seen = new Set<string>();
  const rects: RectLike[] = [];
  for (const element of elements) {
    if (element === ownButton || ownButton.contains(element) || element.closest(`#${BUTTON_ID}`)) continue;
    if (!isFloatingControl(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16 || rect.width > 480 || rect.height > 100) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rects.push(rect);
  }
  return rects;
}

function isFloatingControl(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
    if (current.matches('[role="toolbar"], [role="menu"], [popover], [data-radix-popper-content-wrapper]')) return true;
    const position = getComputedStyle(current).position;
    if (position === 'fixed' || position === 'absolute') return true;
  }
  return false;
}

function detectHighlightSurface(element: HTMLElement): HighlightSurface {
  const backgrounds: string[] = [];
  let current: HTMLElement | null = element;
  const textColor = getComputedStyle(element).color;
  while (current) {
    backgrounds.push(getComputedStyle(current).backgroundColor);
    current = current.parentElement;
  }
  return chooseHighlightSurface(textColor, backgrounds);
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID}{position:fixed;z-index:2147483647;border:0;border-radius:999px;padding:8px 16px;background:#171717;color:#fff;font:600 13px/1 system-ui;box-shadow:0 6px 20px #0003;cursor:pointer}
    #${BUTTON_ID}:hover{background:#333}
    [${HIGHLIGHT_ATTR}]{border-radius:3px;color:inherit!important;cursor:pointer;box-decoration-break:clone;-webkit-box-decoration-break:clone}
    [${HIGHLIGHT_ATTR}][data-color=yellow]{background:#fde68a}[${HIGHLIGHT_ATTR}][data-color=green]{background:#bbf7d0}
    [${HIGHLIGHT_ATTR}][data-color=blue]{background:#bfdbfe}[${HIGHLIGHT_ATTR}][data-color=pink]{background:#fbcfe8}
    [${HIGHLIGHT_ATTR}][data-surface=dark][data-color=yellow]{background:#6b4f00}
    [${HIGHLIGHT_ATTR}][data-surface=dark][data-color=green]{background:#14532d}
    [${HIGHLIGHT_ATTR}][data-surface=dark][data-color=blue]{background:#1e3a8a}
    [${HIGHLIGHT_ATTR}][data-surface=dark][data-color=pink]{background:#831843}
    .dialogue-clipper-toast{position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:10px 14px;border-radius:10px;background:#171717;color:#fff;font:13px system-ui;box-shadow:0 6px 24px #0004}
    .dialogue-clipper-toast[data-kind=error]{background:#991b1b}`;
  document.documentElement.append(style);
}

function unwrapHighlight(mark: HTMLElement): void {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  mark.remove();
  parent.normalize();
}

function updateHighlightMark(mark: HTMLElement, clip: Clip, surfaceElement?: HTMLElement): void {
  mark.dataset.color = clip.highlightColor;
  const surface = surfaceElement ?? mark.parentElement;
  if (surface) mark.dataset.surface = detectHighlightSurface(surface);
}

function toast(message: string, kind: 'success' | 'error' = 'success'): void {
  const element = document.createElement('div');
  element.className = 'dialogue-clipper-toast';
  element.dataset.kind = kind;
  element.textContent = message;
  document.documentElement.append(element);
  window.setTimeout(() => element.remove(), 2200);
}

function pulseElement(element: HTMLElement): void {
  element.animate([
    { outline: '0 solid rgba(245, 158, 11, 0)', outlineOffset: '1px' },
    { outline: '5px solid rgba(245, 158, 11, .55)', outlineOffset: '4px' },
    { outline: '0 solid rgba(245, 158, 11, 0)', outlineOffset: '8px' }
  ], { duration: 1100, easing: 'ease-out' });
}

function scrollMessageStartIntoView(element: HTMLElement): void {
  const previous = element.style.scrollMarginTop;
  element.style.scrollMarginTop = '96px';
  element.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  window.setTimeout(() => { element.style.scrollMarginTop = previous; }, 500);
}

function normalizeMessageText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button, [role="button"], input, textarea, nav, footer, [aria-hidden="true"]').forEach(control => control.remove());
  return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function findActiveConversationNode(elements: Map<string, HTMLElement>): string | undefined {
  const targetY = window.innerHeight * .42;
  let best: { id: string; score: number } | undefined;
  for (const [id, element] of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const score = Math.abs((Math.max(0, rect.top) + Math.min(window.innerHeight, rect.bottom)) / 2 - targetY);
    if (!best || score < best.score) best = { id, score };
  }
  return best?.id;
}
