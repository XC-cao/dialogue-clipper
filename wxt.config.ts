import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: env => {
    const isSafari = env.browser === 'safari';
    return {
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      default_locale: 'en',
      version: '0.1.0',
      ...(isSafari ? {
        browser_specific_settings: { safari: { strict_min_version: '14.0' } },
        permissions: ['storage'],
        action: {
          default_title: '__MSG_actionTitle__',
          default_popup: 'popup.html',
          default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' }
        }
      } : {
        minimum_chrome_version: '116',
        permissions: ['storage', 'sidePanel', 'downloads', 'scripting'],
        action: {
          default_title: '__MSG_actionTitle__',
          default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' }
        },
        side_panel: { default_path: 'sidepanel.html' }
      }),
      host_permissions: [
        'https://chatgpt.com/*',
        'https://claude.ai/*',
        'https://gemini.google.com/*'
      ],
      icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
      commands: {
        'capture-selection': {
          suggested_key: { default: 'Alt+Shift+S', mac: 'MacCtrl+Shift+S' },
          description: '__MSG_captureCommand__'
        }
      }
    };
  }
});
