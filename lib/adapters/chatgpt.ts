import type { SiteAdapter } from './types';
import { isSupportedConversationUrl } from '../conversation-url';
import { canonicalUrl, closest, closestReport, pathConversationId, reportId, titleFromPage, uniqueRoots } from './types';

const MESSAGE = '[data-message-id], [data-testid^="conversation-turn-"]';
const REPORT = '[data-testid*="report" i], [data-testid*="research" i], [role="dialog"] [role="document"], [role="dialog"] article, main [role="document"]';

function messageRoot(node: Node): HTMLElement | null {
  const nearest = closest(node, MESSAGE);
  if (!nearest) return closestReport(node, REPORT);
  // ChatGPT frequently nests data-message-id inside conversation-turn. Treat
  // both as one message so fallback matching does not report false ambiguity.
  return nearest.closest<HTMLElement>('[data-testid^="conversation-turn-"]') ?? nearest;
}

function reportRoot(element: HTMLElement): boolean {
  return element.matches(REPORT) && !element.matches(MESSAGE);
}

export const chatgptAdapter: SiteAdapter = {
  platform: 'chatgpt',
  isConversation: () => isSupportedConversationUrl(location.href, 'chatgpt'),
  metadata: () => ({ platform: 'chatgpt', conversationTitle: titleFromPage('ChatGPT conversation'), conversationUrl: canonicalUrl(), conversationId: pathConversationId() }),
  messageRoot,
  messageId: element => reportRoot(element)
    ? reportId(element)
    : element.dataset.messageId ?? element.querySelector<HTMLElement>('[data-message-id]')?.dataset.messageId ?? element.dataset.testid,
  messageRole: element => {
    if (reportRoot(element)) return 'assistant';
    const author = element.querySelector<HTMLElement>('[data-message-author-role]')?.dataset.messageAuthorRole
      ?? element.dataset.messageAuthorRole;
    return author === 'user' || author === 'assistant' ? author : 'unknown';
  },
  findMessage: id => {
    if (!id) return null;
    if (id.startsWith('report:')) return uniqueRoots(REPORT, messageRoot).find(root => reportId(root) === id) ?? null;
    const found = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"], [data-testid="${CSS.escape(id)}"]`);
    return found ? messageRoot(found) : null;
  },
  contentRoots: () => uniqueRoots(`${MESSAGE}, ${REPORT}`, messageRoot)
};
