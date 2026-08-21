import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { geminiAdapter } from './gemini';
import type { SiteAdapter } from './types';

export const adapters: SiteAdapter[] = [chatgptAdapter, claudeAdapter, geminiAdapter];

export function currentAdapter(): SiteAdapter | null {
  return adapters.find(adapter => location.hostname.includes(adapter.platform === 'chatgpt' ? 'chatgpt' : adapter.platform)) ?? null;
}
