import type { SiteAdapter } from './types';
import { isSupportedConversationUrl } from '../conversation-url';
import { canonicalUrl, closest, closestReport, pathConversationId, reportId, titleFromPage, uniqueRoots } from './types';

const SPECIFIC_MESSAGE = 'user-query, model-response, [data-message-id]';
const MESSAGE = `${SPECIFIC_MESSAGE}, .conversation-container`;
const REPORT = '[role="document"], [data-testid*="report" i], [data-test-id*="report" i], [data-testid*="canvas" i], [data-test-id*="canvas" i], immersive-panel, canvas-panel, [class*="canvas-content" i], [class*="research-report" i]';

function messageRoot(node: Node): HTMLElement | null {
  const identified = closest(node, '[data-message-id]');
  if (identified) return identified;
  const specific = closest(node, SPECIFIC_MESSAGE);
  if (specific) return specific;
  const container = closest(node, '.conversation-container');
  if (container && !container.querySelector(SPECIFIC_MESSAGE)) return container;
  return closestReport(node, REPORT);
}

function reportRoot(element: HTMLElement): boolean {
  return element.matches(REPORT) && !element.matches(MESSAGE);
}

export const geminiAdapter: SiteAdapter = {
  platform: 'gemini',
  isConversation: () => isSupportedConversationUrl(location.href, 'gemini'),
  metadata: () => ({ platform: 'gemini', conversationTitle: titleFromPage('Gemini 对话'), conversationUrl: canonicalUrl(), conversationId: pathConversationId() }),
  messageRoot,
  messageId: element => reportRoot(element) ? reportId(element) : (element.dataset.messageId ?? element.id) || undefined,
  messageRole: element => {
    if (reportRoot(element)) return 'assistant';
    const tag = element.tagName.toLowerCase();
    if (tag === 'user-query' || element.querySelector('user-query')) return 'user';
    if (tag === 'model-response' || element.querySelector('model-response')) return 'assistant';
    return 'unknown';
  },
  findMessage: id => {
    if (!id) return null;
    if (id.startsWith('report:')) return uniqueRoots(REPORT, messageRoot).find(root => reportId(root) === id) ?? null;
    return document.getElementById(id) ?? document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
  },
  contentRoots: () => uniqueRoots(`${MESSAGE}, ${REPORT}`, messageRoot)
};
