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
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(parsed);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function renderMarkdown(notebook: Notebook, clips: Clip[]): string {
  const sections = clips.map((clip, index) => {
    const annotation = clip.annotation.trim()
      ? `\n\n**我的批注**\n\n${clip.annotation.trim()}`
      : '';
    return `## 摘录 ${index + 1}\n\n${quote(clip.originalText)}${annotation}\n\n` +
      `来源：[${linkText(clip.conversationTitle || '未命名对话')}](${linkUrl(clip.conversationUrl)})  \n` +
      `平台：${displayPlatform(clip.platform)}  \n` +
      `角色：${displayRole(clip.messageRole)}  \n` +
      `摘录时间：${dateTime(clip.capturedAt)}`;
  });
  const description = notebook.description.trim() ? `\n${notebook.description.trim()}\n` : '';
  return `---\ntitle: ${yaml(notebook.title)}\ncreated: ${date(notebook.createdAt)}\nupdated: ${date(notebook.updatedAt)}\n---\n\n# ${notebook.title}${description}\n\n${sections.join('\n\n')}\n`;
}

export function markdownFilename(notebook: Notebook): string {
  const safe = notebook.title.trim().replace(/[\\/:*?"<>|：／？＊＂＜＞｜]/g, '-').replace(/\s+/g, ' ').slice(0, 80) || '未命名笔记';
  return `${safe}-${date(notebook.updatedAt)}.md`;
}
