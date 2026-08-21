import type { MessageRole, Platform } from '../models';

export interface ConversationMetadata {
  platform: Platform;
  conversationTitle: string;
  conversationUrl: string;
  conversationId: string;
}

export interface SiteAdapter {
  platform: Platform;
  isConversation(): boolean;
  metadata(): ConversationMetadata;
  messageRoot(node: Node): HTMLElement | null;
  messageId(element: HTMLElement): string | undefined;
  messageRole(element: HTMLElement): MessageRole;
  findMessage(messageId?: string): HTMLElement | null;
  contentRoots(): HTMLElement[];
}

export function canonicalUrl(): string {
  return `${location.origin}${location.pathname}`;
}

export function pathConversationId(): string {
  const parts = location.pathname.split('/').filter(Boolean);
  return parts.at(-1) ?? canonicalUrl();
}

export function titleFromPage(fallback: string): string {
  const title = document.title.replace(/\s*[|–-]\s*(ChatGPT|Claude|Gemini).*$/i, '').trim();
  return title || fallback;
}

export function closest(node: Node, selectors: string): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest<HTMLElement>(selectors) ?? null;
}

export function closestReport(node: Node, selectors: string): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  if (!element || element.closest('nav, aside, form, [contenteditable="true"], [role="navigation"]')) return null;
  let root: HTMLElement | null = null;
  let current: HTMLElement | null = element as HTMLElement;
  while (current && current !== document.body) {
    if (current.matches('nav, aside, form, [contenteditable="true"], [role="navigation"]')) return null;
    if (current.matches(selectors)) root = current;
    current = current.parentElement;
  }
  return root;
}

export function reportId(element: HTMLElement): string {
  const explicit = element.dataset.messageId ?? element.dataset.testid ?? element.id;
  if (explicit) return `report:${explicit}`;
  const heading = element.querySelector('h1, h2, [role="heading"]')?.textContent ?? '';
  const seed = `${heading}\n${(element.textContent ?? '').slice(0, 180)}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `report:${(hash >>> 0).toString(36)}`;
}

export function uniqueRoots(selector: string, resolve: (node: Node) => HTMLElement | null): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .map(resolve)
    .filter((root): root is HTMLElement => Boolean(root))
    .filter((root, index, roots) => roots.indexOf(root) === index);
}
