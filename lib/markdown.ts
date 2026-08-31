import type { Clip, Notebook } from './models';

export interface NoteTransformer {
  transform(markdown: string, notebook: Notebook, clips: Clip[]): Promise<string>;
}

function yaml(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

function quote(value: string): string {
  return value.split(/\r?\n/).map(line => `> ${line}`).join('\n');
}

function linkText(value: string): string {
  return value.replace(/([\\[\]])/g, '\\$1');
}

function linkUrl(value: string): string {
  return value.replace(/([()\\])/g, '\\$1');
}

function displayPlatform(platform: Clip['platform']): string {
  return { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' }[platform];
}

function displayRole(role: Clip['messageRole']): string {
  return { user: 'User', assistant: 'Assistant', unknown: 'Unknown' }[role];
}

function date(value: string): string { return value.slice(0, 10); }

function dateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(parsed);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function renderMarkdown(notebook: Notebook, clips: Clip[]): string {
  const sections = clips.map((clip, index) => {
    const annotation = clip.annotation.trim()
      ? `\n\n**My annotation**\n\n${clip.annotation.trim()}`
      : '';
    return `## Clip ${index + 1}\n\n${quote(clip.originalText)}${annotation}\n\n` +
      `Source: [${linkText(clip.conversationTitle || 'Untitled conversation')}](${linkUrl(clip.conversationUrl)})  \n` +
      `Platform: ${displayPlatform(clip.platform)}  \n` +
      `Role: ${displayRole(clip.messageRole)}  \n` +
      `Clipped at: ${dateTime(clip.capturedAt)}`;
  });
  const description = notebook.description.trim() ? `\n${notebook.description.trim()}\n` : '';
  return `---\ntitle: ${yaml(notebook.title)}\ncreated: ${date(notebook.createdAt)}\nupdated: ${date(notebook.updatedAt)}\n---\n\n# ${notebook.title}${description}\n\n${sections.join('\n\n')}\n`;
}

export function markdownFilename(notebook: Notebook): string {
  const safe = notebook.title.trim().replace(/[\\/:*?"<>|：／？＊＂＜＞｜]/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'Untitled notebook';
  return `${safe}-${date(notebook.updatedAt)}.md`;
}
