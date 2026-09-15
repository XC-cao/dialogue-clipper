import type { MessageRole, Platform } from './models';
import { t } from './i18n';

export interface ConversationExportMessage {
  id: string;
  role: MessageRole;
  markdown: string;
  order: number;
  isReport: boolean;
}

export interface ConversationExport {
  version: 1;
  platform: Platform;
  conversationTitle: string;
  conversationUrl: string;
  conversationId: string;
  messages: ConversationExportMessage[];
  scope: 'current-visible-branch';
  capturedAt: string;
}

const REMOVED_CONTENT = 'button, [role="button"], input, textarea, nav, footer, script, style, noscript, svg, [aria-hidden="true"], [data-testid*="copy" i]';

export function conversationElementToMarkdown(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(REMOVED_CONTENT).forEach(item => item.remove());
  return normalizeMarkdown(Array.from(clone.childNodes).map(nodeToMarkdown).join(''));
}

export function renderConversationExportMarkdown(value: ConversationExport): string {
  let round = 0;
  let hasUserInRound = false;
  const sections = [...value.messages].sort((a, b) => a.order - b.order).map(message => {
    if (message.role === 'user') {
      round += 1;
      hasUserInRound = true;
    } else if (!hasUserInRound || message.role === 'unknown') {
      round += 1;
    }
    const role = message.isReport
      ? t('report')
      : message.role === 'user'
        ? t('user')
        : message.role === 'assistant'
          ? t('assistant')
          : t('unknown');
    const heading = message.role === 'user' || !hasUserInRound || message.role === 'unknown'
      ? `## ${t('conversationRound', String(round))}\n\n### ${role}`
      : `### ${role}`;
    if (message.role === 'assistant') hasUserInRound = false;
    return `${heading}\n\n${message.markdown}`;
  });
  const platform = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' }[value.platform];
  return `---\ntitle: ${yaml(value.conversationTitle)}\nplatform: ${yaml(platform)}\nsource: ${yaml(value.conversationUrl)}\nexported_at: ${yaml(value.capturedAt)}\nscope: ${yaml(value.scope)}\nmessages: ${value.messages.length}\n---\n\n# ${value.conversationTitle}\n\n> ${t('conversationExportScopeNote')}\n\n${sections.join('\n\n')}\n`;
}

export function conversationExportFilename(value: ConversationExport): string {
  const safe = value.conversationTitle.trim()
    .replace(/[\\/:*?"<>|：／？＊＂＜＞｜]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 72) || t('untitledConversation');
  const date = value.capturedAt.slice(0, 10);
  const platform = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' }[value.platform];
  return `${safe}-${platform}-${date}.md`;
}

export function isConversationExport(value: unknown): value is ConversationExport {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ConversationExport>;
  if (
    item.version !== 1 ||
    !['chatgpt', 'claude', 'gemini'].includes(String(item.platform)) ||
    typeof item.conversationTitle !== 'string' || item.conversationTitle.length > 1000 ||
    typeof item.conversationUrl !== 'string' || item.conversationUrl.length > 4096 ||
    typeof item.conversationId !== 'string' || item.conversationId.length > 1000 ||
    item.scope !== 'current-visible-branch' ||
    typeof item.capturedAt !== 'string' ||
    !Array.isArray(item.messages) || item.messages.length > 600
  ) return false;
  let totalLength = 0;
  return item.messages.every(message => {
    totalLength += typeof message?.markdown === 'string' ? message.markdown.length : 0;
    return Boolean(
      message && typeof message.id === 'string' && message.id.length <= 512 &&
      ['user', 'assistant', 'unknown'].includes(String(message.role)) &&
      typeof message.markdown === 'string' && message.markdown.length <= 5_000_000 &&
      Number.isInteger(message.order) && message.order >= 0 &&
      typeof message.isReport === 'boolean' && totalLength <= 20_000_000
    );
  });
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').replace(/\u00a0/g, ' ');
  if (!(node instanceof HTMLElement)) return '';
  if (node.matches('.katex, .katex-display')) {
    const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
    if (tex) return node.matches('.katex-display') ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
  }
  const tag = node.tagName.toLowerCase();
  const children = () => Array.from(node.childNodes).map(nodeToMarkdown).join('');
  if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${inlineText(children())}\n\n`;
  if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') return `\n\n${children()}\n\n`;
  if (tag === 'br') return '\n';
  if (tag === 'strong' || tag === 'b') return `**${inlineText(children())}**`;
  if (tag === 'em' || tag === 'i') return `*${inlineText(children())}*`;
  if (tag === 'del' || tag === 's') return `~~${inlineText(children())}~~`;
  if (tag === 'blockquote') return `\n\n${normalizeMarkdown(children()).split('\n').map(line => `> ${line}`).join('\n')}\n\n`;
  if (tag === 'a') {
    const label = inlineText(children()) || node.getAttribute('href') || '';
    const href = node.getAttribute('href');
    return href ? `[${label.replace(/([\\[\]])/g, '\\$1')}](${href.replace(/([()\\])/g, '\\$1')})` : label;
  }
  if (tag === 'img') {
    const src = node.getAttribute('src');
    return src ? `![${node.getAttribute('alt') ?? ''}](${src.replace(/([()\\])/g, '\\$1')})` : '';
  }
  if (tag === 'pre') {
    const code = node.querySelector('code') ?? node;
    const language = code.className.match(/(?:language-|lang-)([\w+-]+)/)?.[1] ?? '';
    const text = (code.textContent ?? '').replace(/\n$/, '');
    const fence = text.includes('```') ? '````' : '```';
    return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
  }
  if (tag === 'code') return `\`${(node.textContent ?? '').replace(/`/g, '\\`')}\``;
  if (tag === 'ul' || tag === 'ol') {
    const ordered = tag === 'ol';
    const items = Array.from(node.children).filter(child => child.tagName.toLowerCase() === 'li');
    return `\n\n${items.map((item, index) => {
      const content = normalizeMarkdown(Array.from(item.childNodes).map(nodeToMarkdown).join(''));
      const prefix = ordered ? `${index + 1}. ` : '- ';
      return `${prefix}${content.replace(/\n/g, '\n  ')}`;
    }).join('\n')}\n\n`;
  }
  if (tag === 'table') return tableToMarkdown(node);
  return children();
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr')).map(row =>
    Array.from(row.querySelectorAll(':scope > th, :scope > td')).map(cell =>
      inlineText(Array.from(cell.childNodes).map(nodeToMarkdown).join('')).replace(/\|/g, '\\|')
    )
  ).filter(row => row.length);
  if (!rows.length) return '';
  const width = Math.max(...rows.map(row => row.length));
  const normalizeRow = (row: string[]) => `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`;
  return `\n\n${normalizeRow(rows[0]!)}\n${normalizeRow(Array.from({ length: width }, () => '---'))}\n${rows.slice(1).map(normalizeRow).join('\n')}\n\n`;
}

function normalizeMarkdown(value: string): string {
  return value.split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function yaml(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}
