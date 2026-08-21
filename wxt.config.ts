import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '对话摘录 Dialogue Clipper',
    description: '在 ChatGPT、Claude 和 Gemini 中摘录原文，用对话图与摘录图导航长对话，并导出 Markdown。',
    version: '0.1.0',
    minimum_chrome_version: '116',
    permissions: ['storage', 'sidePanel', 'downloads'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://claude.ai/*',
      'https://gemini.google.com/*'
    ],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: {
      default_title: '打开对话摘录',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' }
    },
    side_panel: { default_path: 'sidepanel.html' },
    commands: {
      'capture-selection': {
        suggested_key: { default: 'Alt+Shift+S', mac: 'MacCtrl+Shift+S' },
        description: '摘录当前选中的文字'
      }
    }
  }
});
