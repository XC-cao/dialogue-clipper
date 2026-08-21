import type { TextAnchor } from './models';

export interface LocatedText { node: Text; start: number; end: number }

export function elementTextOffset(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(container, offset);
  return range.toString().length;
}

export function createAnchor(range: Range, message: HTMLElement, messageRole: TextAnchor['messageRole'], messageId?: string): TextAnchor {
  const full = message.textContent ?? '';
  const startOffset = elementTextOffset(message, range.startContainer, range.startOffset);
  const exact = range.toString();
  return {
    exact,
    prefix: full.slice(Math.max(0, startOffset - 32), startOffset),
    suffix: full.slice(startOffset + exact.length, startOffset + exact.length + 32),
    messageId,
    messageRole,
    startOffset,
    endOffset: startOffset + exact.length,
    status: 'resolved'
  };
}

export function uniqueTextOffset(text: string, anchor: TextAnchor): number | null {
  if (text.slice(anchor.startOffset, anchor.endOffset) === anchor.exact) return anchor.startOffset;
  const positions: number[] = [];
  let from = 0;
  while (from <= text.length) {
    const position = text.indexOf(anchor.exact, from);
    if (position === -1) break;
    positions.push(position);
    from = position + Math.max(1, anchor.exact.length);
  }
  // The selected quotation itself is the strongest evidence. Context is only
  // needed to disambiguate repeated text; requiring it for a unique quotation
  // made harmless Markdown/whitespace changes break restoration.
  if (positions.length === 1) return positions[0]!;
  const contextual = positions.filter(position => {
    const prefixMatches = !anchor.prefix || text.slice(Math.max(0, position - anchor.prefix.length), position) === anchor.prefix;
    const suffixMatches = !anchor.suffix || text.slice(position + anchor.exact.length, position + anchor.exact.length + anchor.suffix.length) === anchor.suffix;
    return prefixMatches && suffixMatches;
  });
  return contextual.length === 1 ? contextual[0]! : null;
}

export function locateTextSegments(root: HTMLElement, anchor: TextAnchor): LocatedText[] {
  const offset = uniqueTextOffset(root.textContent ?? '', anchor);
  if (offset === null) return [];
  // Existing highlights must still contribute to the message-wide character
  // offset. Skipping their text shifted every later clip in the same message.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let traversed = 0;
  const selectionEnd = offset + anchor.exact.length;
  const segments: LocatedText[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const length = node.data.length;
    const nodeEnd = traversed + length;
    if (nodeEnd > offset && traversed < selectionEnd) {
      segments.push({
        node,
        start: Math.max(0, offset - traversed),
        end: Math.min(length, selectionEnd - traversed)
      });
    }
    traversed = nodeEnd;
    if (traversed >= selectionEnd) break;
  }
  const covered = segments.reduce((total, segment) => total + segment.end - segment.start, 0);
  return covered === anchor.exact.length ? segments : [];
}

export function locateText(root: HTMLElement, anchor: TextAnchor): LocatedText | null {
  const segments = locateTextSegments(root, anchor);
  return segments.length === 1 ? segments[0]! : null;
}
