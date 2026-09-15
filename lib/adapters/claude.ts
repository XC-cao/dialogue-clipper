import type { SiteAdapter } from './types';
import { isSupportedConversationUrl } from '../conversation-url';
import { canonicalUrl, closest, closestReport, pathConversationId, reportId, titleFromPage, uniqueRoots } from './types';
import { t } from '../i18n';

const SEMANTIC_MESSAGE = '[data-testid="user-message"], [data-testid="assistant-message"], [data-message-role]';
const MESSAGE = `${SEMANTIC_MESSAGE}, [data-testid="message-content"], [data-testid="user-message-content"], [data-testid="assistant-message-content"], .font-claude-message, .font-user-message, .font-claude-response, .font-user-response, [class*="font-claude-message" i], [class*="font-user-message" i], [class*="font-claude-response" i], [class*="font-user-response" i]`;
const REPORT = '[data-testid*="artifact" i], [data-testid*="research" i], [role="document"], [class*="artifact-content" i], [class*="research-report" i]';

function messageRoot(node: Node): HTMLElement | null {
  const nearest = closest(node, MESSAGE);
  const semantic = nearest?.closest<HTMLElement>(SEMANTIC_MESSAGE);
  if (semantic) return semantic;
  if (nearest) {
    // Claude sometimes puts the response text in a class-marked content
    // fragment without the older data-testid wrapper. Promote nested markers
    // to the outermost matching message container so the selection's start
    // and end nodes still resolve to one message.
    let root = nearest;
    for (let parent = nearest.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches(MESSAGE)) root = parent;
    }
    return root;
  }
  return closestReport(node, REPORT);
}

function reportRoot(element: HTMLElement): boolean {
  return element.matches(REPORT) && !element.matches(MESSAGE);
}

export const claudeAdapter: SiteAdapter = {
  platform: 'claude',
  isConversation: () => isSupportedConversationUrl(location.href, 'claude'),
  metadata: () => ({ platform: 'claude', conversationTitle: titleFromPage(t('claudeConversation')), conversationUrl: canonicalUrl(), conversationId: pathConversationId() }),
  messageRoot,
  messageId: element => reportRoot(element)
    ? reportId(element)
    : (element.dataset.messageId ?? element.querySelector<HTMLElement>('[data-message-id]')?.dataset.messageId ?? element.id) || undefined,
  messageRole: element => {
    if (reportRoot(element)) return 'assistant';
    const marker = `${element.dataset.testid ?? ''} ${element.dataset.messageRole ?? ''} ${element.className}`.toLowerCase();
    if (marker.includes('user')) return 'user';
    if (marker.includes('assistant') || marker.includes('claude') || marker.includes('response')) return 'assistant';
    return 'unknown';
  },
  findMessage: id => {
    if (!id) return null;
    if (id.startsWith('report:')) return uniqueRoots(REPORT, messageRoot).find(root => reportId(root) === id) ?? null;
    return document.getElementById(id) ?? document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
  },
  contentRoots: () => uniqueRoots(`${MESSAGE}, ${REPORT}`, messageRoot)
};
