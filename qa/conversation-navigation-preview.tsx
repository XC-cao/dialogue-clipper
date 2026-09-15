import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../entrypoints/sidepanel/App';
import { buildConversationSnapshot, conversationTextFingerprint, generateConversationNodeTitle } from '../lib/conversation-graph';
import { extractConversationOutline } from '../lib/conversation-outline';
import { SCHEMA_VERSION, type Clip, type StoredState } from '../lib/models';
import zh from '../public/_locales/zh_CN/messages.json';
import en from '../public/_locales/en/messages.json';
import '@xyflow/react/dist/style.css';
import '../entrypoints/sidepanel/styles.css';
import '../entrypoints/sidepanel/notebook-header.css';
import '../entrypoints/sidepanel/card-navigation.css';
import '../entrypoints/sidepanel/mind-map.css';
import '../entrypoints/sidepanel/conversation-map.css';
import '../entrypoints/sidepanel/conversation-export.css';

// Isolated development fixture: no browser-extension storage or live conversation access.
const event = () => {
  const listeners = new Set<(...args: any[]) => void>();
  return { addListener: (fn: (...args: any[]) => void) => listeners.add(fn), removeListener: (fn: (...args: any[]) => void) => listeners.delete(fn), emit: (...args: any[]) => listeners.forEach(fn => fn(...args)) };
};
const runtimeMessages = event();
const storageChanges = event();
const copy = [
  ['先从哪些资料源开始？', '官方公报、研究数据库与事件档案。'],
  ['哪些字段值得保存？', '来源、日期、主题、实体和引用链接。'],
  ['如何处理重复与冲突？', '保留来源差异，再核对原始记录。'],
  ['怎样搭建知识库结构？', '按主题组织，用实体和事件建立关联。\n\n1. 按主题建立入口。\n2. 为人物、机构和事件分别建档。\n3. 用引用链接连接资料，保留来源依据。\n\n为每条信息保留可追溯的原始来源。\n实体关系应建立在明确证据之上。'],
  ['如何持续更新资料？', '定期增量采集，保留修改与验证记录。'],
  ['第一步具体做什么？', '选一个主题，整理十条可信资料试运行。']
];
const total = new URLSearchParams(location.search).get('rounds') === '20' ? 20 : 6;
const structuredAnswer = document.createElement('article');
structuredAnswer.innerHTML = '<p>按主题组织，用实体和事件建立关联。</p><h2>1. 按主题建立入口</h2><p>先以<b>研究主题</b>聚合资料，避免一开始分类过细。</p><h2>2. 为实体和事件分别建档</h2><p>整理<strong>人物、机构与事件</strong>，逐步补充关系。</p><h2>3. 用引用链接连接资料</h2><p><strong>保留原始来源与证据</strong>。为每条信息保留可追溯的原始来源。实体关系应建立在明确证据之上。</p>';
copy[3]![1] = Array.from(structuredAnswer.children).map(element => element.textContent).join('\n\n');
const metadata = { platform: 'chatgpt' as const, conversationId: 'design-preview', conversationUrl: 'https://chatgpt.com/c/design-preview', conversationTitle: '搭建政治研究知识库' };
const nodes = Array.from({ length: total }, (_, round) => copy[round % copy.length]!).flatMap((pair, round) => pair.map((text, index) => ({
  id: `${index ? 'a' : 'q'}${round + 1}`, order: round * 2 + index,
  role: index ? 'assistant' as const : 'user' as const, title: generateConversationNodeTitle(text!),
  text: text!, searchText: text!, fingerprint: conversationTextFingerprint(text!),
  outline: index && round % copy.length === 3 ? extractConversationOutline(structuredAnswer) : undefined,
  clipIds: index && round === 1 ? ['clip1'] : index && round === 3 ? ['clip2', 'clip3'] : [], isReport: false
})));
let snapshot = buildConversationSnapshot(metadata, nodes, 'a5');
const clipTexts = ['来源、日期、主题、实体和引用链接。', '为每条信息保留可追溯的原始来源。', '实体关系应建立在明确证据之上。'];
const clips: Record<string, Clip> = Object.fromEntries(clipTexts.map((text, index) => {
  const id = `clip${index + 1}`;
  return [id, { id, notebookId: 'research', originalText: text, annotation: '', ...metadata, messageRole: 'assistant', capturedAt: '2026-09-07T00:00:00Z', highlightColor: 'green', anchor: { exact: text, prefix: '', suffix: '', messageRole: 'assistant', startOffset: 0, endOffset: text.length, status: 'resolved' } }];
}));
let state: StoredState = { schemaVersion: SCHEMA_VERSION, currentNotebookId: 'research', pendingCaptures: [], clips, notebooks: { research: { id: 'research', title: '研究笔记', description: '', clipIds: Object.keys(clips), schemaVersion: SCHEMA_VERSION, createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z' } } };
let locateCount = 0;
const report = (message: string) => parent.postMessage({ previewStatus: message }, location.origin);
const api = {
  i18n: { getMessage: (key: string, values?: string | string[]) => {
    if (key === '@@ui_locale') return 'zh_CN';
    const dictionary = { ...en, ...zh } as Record<string, { message: string }>;
    const text = dictionary[key]?.message ?? '';
    return (Array.isArray(values) ? values : values ? [values] : []).reduce((result, value, index) => result.replaceAll(`$${index + 1}`, value), text);
  } },
  runtime: { onMessage: runtimeMessages, getURL: (path: string) => path, getManifest: () => ({}) },
  tabs: {
    onActivated: event(), onUpdated: event(),
    query: async () => [{ id: 7, url: metadata.conversationUrl }], get: async () => ({ id: 7, url: metadata.conversationUrl }), update: async () => ({}),
    sendMessage: async (_tabId: number, message: { type: string; nodeId?: string }) => {
      if (message.type === 'GET_CONVERSATION_GRAPH') return { version: 2, type: 'CONVERSATION_GRAPH_RESULT', ok: true, snapshot };
      if (message.type === 'SCROLL_TO_CONVERSATION_NODE') {
        snapshot = { ...snapshot, activeNodeId: message.nodeId };
        report(`已请求定位 ${message.nodeId} · 累计 ${++locateCount} 次`);
        runtimeMessages.emit({ version: 2, type: 'CONVERSATION_ACTIVE_NODE', nodeId: message.nodeId, conversationUrl: metadata.conversationUrl }, { tab: { id: 7 } });
        return { version: 2, type: 'SCROLL_TO_CONVERSATION_NODE_RESULT', ok: true };
      }
      return undefined;
    }
  },
  storage: {
    onChanged: storageChanges,
    local: {
      get: async (key: string) => key === 'dialogueClipperState' ? { dialogueClipperState: structuredClone(state) } : {},
      set: async (value: { dialogueClipperState?: StoredState }) => { if (value.dialogueClipperState) state = value.dialogueClipperState; storageChanges.emit({}, 'local'); },
      getBytesInUse: async () => 5000, remove: async () => {}
    },
    session: { get: async () => ({}), remove: async () => {} }
  }
};
Object.defineProperty(globalThis, 'chrome', { value: api, configurable: true });
window.addEventListener('error', event => report(`页面错误：${event.message}`));
window.addEventListener('unhandledrejection', event => report(`未处理错误：${String(event.reason)}`));
createRoot(document.getElementById('root')!).render(createElement(App));
