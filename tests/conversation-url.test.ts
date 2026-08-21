import { describe, expect, it } from 'vitest';
import { conversationPlatformFromUrl, isSupportedConversationUrl } from '../lib/conversation-url';

describe('conversation URL detection', () => {
  it('accepts regular, project and custom-GPT ChatGPT conversations', () => {
    expect(isSupportedConversationUrl('https://chatgpt.com/c/abc')).toBe(true);
    expect(isSupportedConversationUrl('https://chatgpt.com/g/g-p-project-slug/c/abc')).toBe(true);
    expect(isSupportedConversationUrl('https://chatgpt.com/g/g-custom-slug/c/abc')).toBe(true);
    expect(conversationPlatformFromUrl('https://chatgpt.com/g/g-custom-slug/c/abc')).toBe('chatgpt');
  });

  it('accepts supported Claude and Gemini conversations', () => {
    expect(isSupportedConversationUrl('https://claude.ai/chat/abc', 'claude')).toBe(true);
    expect(isSupportedConversationUrl('https://gemini.google.com/app/abc', 'gemini')).toBe(true);
  });

  it('rejects home, project index and unrelated routes', () => {
    expect(isSupportedConversationUrl('https://chatgpt.com/')).toBe(false);
    expect(isSupportedConversationUrl('https://chatgpt.com/g/g-p-project/project')).toBe(false);
    expect(isSupportedConversationUrl('https://claude.ai/new')).toBe(false);
    expect(isSupportedConversationUrl('https://example.com/c/abc')).toBe(false);
    expect(isSupportedConversationUrl('not a URL')).toBe(false);
  });
});
