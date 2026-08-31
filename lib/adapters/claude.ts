import type { SiteAdapter } from './types';
import { isSupportedConversationUrl } from '../conversation-url';
import { canonicalUrl, closest, closestReport, pathConversationId, reportId, titleFromPage, uniqueRoots } from './types';

const MESSAGE = '[data-testid="user-message"], [data-testid="assistant-message"], [data-message-role], .font-claude-message, .font-user-message';
const REPORT = '[data-testid*="artifact" i], [data-testid*="research" i], [role="document"], [class*="artifact-content" i], [class*="research-report" i]';

function messageRoot(node: Node): HTMLElement | null {
  const nearest = closest(node, MESSAGE);
  const semantic = nearest?.closest<HTMLElement>('[data-testid="user-message"], [data-testid="assistant-message"], [data-message-role]');
  return semantic ?? nearest ?? closestReport(node, REPORT);
}

function reportRoot(element: HTMLElement): boolean {
  return element.matches(REPORT) && !element.matches(MESSAGE);
}

export const claudeAdapter: SiteAdapter = {
  platform: 'claude',
  isConversation: () => isSupportedConversationUrl(location.href, 'claude'),
  metadata: () => ({ platform: 'claude', conversationTitle: titleFromPage('Claude conversation'), conversationUrl: canonicalUrl(), conversationId: pathConversationId() }),
  messageRoot,
  messageId: element => reportRoot(element) ? reportId(element) : (element.dataset.messageId ?? element.id) || undefined,
  messageRole: element => {
    if (reportRoot(element)) return 'assistant';
    const marker = `${element.dataset.testid ?? ''} ${element.dataset.messageRole ?? ''} ${element.className}`.toLowerCase();
    if (marker.includes('user')) return 'user';
    if (marker.includes('assistant') || marker.includes('claude')) return 'assistant';
    return 'unknown';
  },
  findMessage: id => {
    if (!id) return null;
    if (id.startsWith('report:')) return uniqueRoots(REPORT, messageRoot).find(root => reportId(root) === id) ?? null;
    return document.getElementById(id) ?? document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
  },
  contentRoots: () => uniqueRoots(`${MESSAGE}, ${REPORT}`, messageRoot)
};
