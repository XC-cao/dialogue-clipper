import type { Platform } from './models';

const HOSTS: Record<Platform, string> = {
  chatgpt: 'chatgpt.com',
  claude: 'claude.ai',
  gemini: 'gemini.google.com'
};

const PATHS: Record<Platform, RegExp> = {
  // ChatGPT project and custom-GPT conversations use /g/<slug>/c/<id>.
  // Share links can also contain another segment after /share/.
  chatgpt: /(?:^|\/)(?:c|share|research|deep-research)\/[^/]+(?:\/|$)/,
  claude: /^\/(?:chat|research|artifacts?)\/[^/]+(?:\/|$)/,
  gemini: /^\/(?:app|canvas)\/[^/]+(?:\/|$)/
};

export function conversationPlatformFromUrl(value?: string): Platform | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return (Object.keys(HOSTS) as Platform[]).find(platform =>
      url.hostname === HOSTS[platform] && PATHS[platform].test(url.pathname)
    );
  } catch {
    return undefined;
  }
}

export function isSupportedConversationUrl(value?: string, platform?: Platform): boolean {
  const detected = conversationPlatformFromUrl(value);
  return detected !== undefined && (platform === undefined || detected === platform);
}

export function conversationIdFromUrl(value?: string): string | undefined {
  if (!conversationPlatformFromUrl(value)) return undefined;
  try {
    return new URL(value!).pathname.split('/').filter(Boolean).at(-1);
  } catch {
    return undefined;
  }
}

export function isSameConversationUrl(left?: string, right?: string): boolean {
  const leftPlatform = conversationPlatformFromUrl(left);
  const rightPlatform = conversationPlatformFromUrl(right);
  if (!leftPlatform || leftPlatform !== rightPlatform) return false;
  const leftId = conversationIdFromUrl(left);
  return Boolean(leftId && leftId === conversationIdFromUrl(right));
}
