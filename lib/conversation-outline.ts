export interface ConversationOutlineItem {
  kind: 'heading' | 'emphasis';
  /** Heading rank, or one level below the preceding heading for bold text. */
  level: number;
  text: string;
}

export interface ConversationOutline {
  items: ConversationOutlineItem[];
  truncated: boolean;
}

export const MAX_OUTLINE_ITEMS = 32;
export const MAX_OUTLINE_ITEM_TEXT = 160;
const STRUCTURE = 'h1, h2, h3, h4, h5, h6, [role="heading"], strong, b';
const HEADING = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
const EXCLUDED = 'button, [role="button"], input, textarea, nav, footer, script, style, noscript, svg, pre, [hidden], [aria-hidden="true"], [data-testid*="copy" i]';

/** Read real formatting, not inferred/AI-generated section titles. Never send HTML to the panel. */
export function extractConversationOutline(root: HTMLElement, maxText = 4000): ConversationOutline {
  const entries: ConversationOutlineItem[] = [];
  let truncated = false;
  let remaining = Math.max(0, maxText);
  let headingLevel = 0;
  const candidates = [...(root.matches(STRUCTURE) ? [root] : []), ...root.querySelectorAll<HTMLElement>(STRUCTURE)];
  for (const element of candidates) {
    if (element.closest(EXCLUDED) || element.closest('code')) continue;
    // Ignore nested bold inside a heading/bold item, but not repeated labels in different sections.
    if (element !== root && element.parentElement?.closest(STRUCTURE) && root.contains(element.parentElement.closest(STRUCTURE))) continue;
    let hidden = false;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
      if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') { hidden = true; break; }
      if (parent === root) break;
    }
    if (hidden) continue;
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(EXCLUDED).forEach(child => child.remove());
    const originalText = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!originalText) continue;
    const text = originalText.length > MAX_OUTLINE_ITEM_TEXT ? `${originalText.slice(0, MAX_OUTLINE_ITEM_TEXT - 1)}…` : originalText;
    if (text !== originalText) truncated = true;
    const isHeading = element.matches(HEADING);
    if (isHeading) headingLevel = Math.max(1, Math.min(6, Math.floor(Number(element.getAttribute('aria-level') ?? element.tagName.slice(1))) || 2));
    entries.push({ kind: isHeading ? 'heading' : 'emphasis', level: isHeading ? headingLevel : Math.min(6, headingLevel + 1), text });
  }
  // Preserve the whole answer's skeleton when many bold phrases exhaust the budget.
  // Allocate headings first, then restore source order for display.
  const selected: Array<{ item: ConversationOutlineItem; index: number }> = [];
  const prioritized = entries.map((item, index) => ({ item, index }))
    .sort((a, b) => Number(b.item.kind === 'heading') - Number(a.item.kind === 'heading'));
  for (const { item, index } of prioritized) {
    if (selected.length >= MAX_OUTLINE_ITEMS || remaining < 2) { truncated = true; break; }
    const text = item.text.length > remaining ? `${item.text.slice(0, remaining - 1)}…` : item.text;
    if (text !== item.text) truncated = true;
    selected.push({ item: { ...item, text }, index });
    remaining -= text.length;
  }
  return { items: selected.sort((a, b) => a.index - b.index).map(entry => entry.item), truncated };
}

export function isConversationOutline(value: unknown): value is ConversationOutline {
  if (!value || typeof value !== 'object') return false;
  const outline = value as Partial<ConversationOutline>;
  return typeof outline.truncated === 'boolean' && Array.isArray(outline.items) && outline.items.length <= MAX_OUTLINE_ITEMS &&
    outline.items.every(item => item && (item.kind === 'heading' || item.kind === 'emphasis') &&
      Number.isInteger(item.level) && item.level >= 1 && item.level <= 6 &&
      typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= MAX_OUTLINE_ITEM_TEXT);
}
