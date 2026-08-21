import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, ConnectionLineType, Controls, MarkerType, MiniMap, Position,
  ReactFlow, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type OnNodeDrag
} from '@xyflow/react';
import { markdownFilename, renderMarkdown } from '../../lib/markdown';
import { validParentOptions } from '../../lib/clip-tree';
import { layoutMindMap, MIND_MAP_ROOT_ID } from '../../lib/mind-map-layout';
import type { Clip, HighlightColor, Notebook, StoredState } from '../../lib/models';
import { EMPTY_STATE } from '../../lib/models';
import {
  assignPending, createNotebook, deleteClip, deleteNotebook, loadState, reorderClips,
  selectNotebook, setClipParent, updateClip, updateMindMapPositions, updateNotebook
} from '../../lib/storage';
import type { ExtensionMessage } from '../../lib/messages';
import { ConversationMap } from './ConversationMap';

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];

export function App() {
  const [state, setState] = useState<StoredState>(EMPTY_STATE);
  const [view, setView] = useState<'clips' | 'navigation' | 'preview'>('clips');
  const [navigationMode, setNavigationMode] = useState<'conversation' | 'clips'>('conversation');
  const [focusedClipId, setFocusedClipId] = useState<string>();
  const [conversationFocusClipId, setConversationFocusClipId] = useState<string>();
  const [conversationTargetTabId, setConversationTargetTabId] = useState<number>();
  const [cardFocusClipId, setCardFocusClipId] = useState<string>();
  const [notice, setNotice] = useState('');
  const [bytes, setBytes] = useState(0);
  const [creating, setCreating] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const notebook = state.currentNotebookId ? state.notebooks[state.currentNotebookId] : undefined;
  const clips = useMemo(() => notebook?.clipIds.map(id => state.clips[id]).filter((clip): clip is Clip => Boolean(clip)) ?? [], [notebook, state.clips]);
  const markdown = notebook ? renderMarkdown(notebook, clips) : '';

  const refresh = async () => {
    setState(await loadState());
    setBytes(await chrome.storage.local.getBytesInUse());
  };

  useEffect(() => {
    void refresh();
    let focusRequest = 0;
    const focusClip = async (value: unknown) => {
      const id = value && typeof value === 'object' ? (value as { clipId?: unknown }).clipId : undefined;
      if (typeof id !== 'string') return;
      const request = ++focusRequest;
      const latest = await loadState();
      if (request !== focusRequest) return;
      const clip = latest.clips[id];
      if (clip) {
        if (latest.currentNotebookId !== clip.notebookId) await selectNotebook(clip.notebookId);
        if (request !== focusRequest) return;
        setState(await loadState());
        setView('clips');
        setCardFocusClipId(id);
      }
      const current = (await chrome.storage.session.get('dialogueClipperFocusRequest')).dialogueClipperFocusRequest;
      if (current && typeof current === 'object' && (current as { clipId?: unknown }).clipId === id) {
        await chrome.storage.session.remove('dialogueClipperFocusRequest');
      }
    };
    void chrome.storage.session.get('dialogueClipperFocusRequest').then(result => void focusClip(result.dialogueClipperFocusRequest));
    const listener = (_changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local') void refresh(); };
    chrome.storage.onChanged.addListener(listener);
    const focus = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session') focusClip(changes.dialogueClipperFocusRequest?.newValue);
    };
    chrome.storage.onChanged.addListener(focus);
    return () => { chrome.storage.onChanged.removeListener(listener); chrome.storage.onChanged.removeListener(focus); };
  }, []);

  useEffect(() => {
    if (!cardFocusClipId || view !== 'clips' || !clips.some(clip => clip.id === cardFocusClipId)) return;
    const frame = window.requestAnimationFrame(() => {
      const card = document.getElementById(`clip-${cardFocusClipId}`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.focus({ preventScroll: true });
      setCardFocusClipId(undefined);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cardFocusClipId, clips, view]);

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2000); };

  const chooseNotebook = async (id: string) => {
    await selectNotebook(id);
    if (state.pendingCaptures.length) await assignPending(id);
  };

  const create = async (title: string) => {
    const notebook = await createNotebook(title || '未命名笔记');
    if (state.pendingCaptures.length) await assignPending(notebook.id);
    setCreating(false);
  };

  const removeNotebook = async () => {
    if (!notebook || !confirm(`删除“${notebook.title}”及其中所有摘录？此操作无法撤销。`)) return;
    await deleteNotebook(notebook.id);
    await refreshPageHighlights();
  };

  const removeClip = async (clip: Clip) => {
    if (!confirm('删除这条摘录？此操作无法撤销。')) return;
    await deleteClip(clip.id);
    await refreshPageHighlights();
  };

  const dropOn = async (targetId: string) => {
    if (!notebook || !draggedId || draggedId === targetId) return;
    const next = [...notebook.clipIds];
    const from = next.indexOf(draggedId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setDraggedId(null);
    await reorderClips(notebook.id, next);
  };

  const copy = async () => { await navigator.clipboard.writeText(markdown); notify('Markdown 已复制'); };
  const download = async () => {
    if (!notebook) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    try {
      await chrome.downloads.download({ url, filename: markdownFilename(notebook), conflictAction: 'uniquify', saveAs: true });
      notify('Markdown 下载已开始');
    } finally { window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
  };

  const usage = Math.min(100, bytes / 10_485_760 * 100);

  const showClipsFromConversation = useCallback(async (clipIds: string[]) => {
    const candidates = clipIds.map(id => state.clips[id]).filter((clip): clip is Clip => Boolean(clip));
    if (!candidates.length) return;
    const inCurrentNotebook = candidates.find(clip => clip.notebookId === notebook?.id);
    const notebookIds = new Set(candidates.map(clip => clip.notebookId));
    if (!inCurrentNotebook && notebookIds.size > 1) {
      notify('该消息的摘录分布在多个笔记，请先选择笔记');
      return;
    }
    const target = inCurrentNotebook ?? candidates[0]!;
    if (target.notebookId !== notebook?.id) {
      await selectNotebook(target.notebookId);
      await refresh();
    } else if (notebookIds.size > 1) {
      notify('当前展示本笔记中的摘录；该消息在其他笔记中也有摘录');
    }
    setFocusedClipId(target.id);
    setNavigationMode('clips');
    setView('navigation');
  }, [notebook?.id, state.clips]);

  const showConversationFromClip = useCallback((clip: Clip) => {
    setConversationFocusClipId(clip.id);
    setConversationTargetTabId(undefined);
    setNavigationMode('conversation');
    setView('navigation');
    void openClipSource(clip).then(tabId => {
      if (tabId !== undefined) setConversationTargetTabId(tabId);
    });
  }, []);

  const clearClipMapFocus = useCallback(() => setFocusedClipId(undefined), []);
  const clearConversationFocus = useCallback(() => {
    setConversationFocusClipId(undefined);
    setConversationTargetTabId(undefined);
  }, []);

  return <main>
    <header className="app-header">
      <div><div className="eyebrow">LOCAL-FIRST</div><h1>对话摘录</h1></div>
      <button className="icon-button" title="新建笔记" onClick={() => setCreating(true)}>＋</button>
    </header>

    {state.pendingCaptures.length > 0 && <section className="pending">
      <strong>{state.pendingCaptures.length} 条摘录等待保存</strong>
      <span>新建或选择一个笔记即可归档。</span>
    </section>}

    {(creating || Object.keys(state.notebooks).length === 0) && <CreateNotebook onCreate={create} canCancel={Object.keys(state.notebooks).length > 0} onCancel={() => setCreating(false)} />}

    {Object.keys(state.notebooks).length > 0 && <>
      <label className="field-label" htmlFor="notebook-select">当前笔记</label>
      <div className="notebook-row">
        <select id="notebook-select" value={notebook?.id ?? ''} onChange={event => void chooseNotebook(event.target.value)}>
          {Object.values(state.notebooks).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="danger-ghost" title="删除笔记" onClick={() => void removeNotebook()}>删除</button>
      </div>
    </>}

    {notebook && <NotebookEditor notebook={notebook} />}
    <nav className="tabs">
      <button className={view === 'clips' ? 'active' : ''} disabled={!notebook} onClick={() => setView('clips')}>摘录 {notebook && <span>{clips.length}</span>}</button>
      <button className={view === 'navigation' ? 'active' : ''} onClick={() => setView('navigation')}>导航</button>
      <button className={view === 'preview' ? 'active' : ''} disabled={!notebook} onClick={() => setView('preview')}>Markdown</button>
    </nav>

    {view === 'clips' && notebook && <section className="clip-list">
        {clips.length === 0 && <EmptyState />}
        {clips.map(clip => <ClipCard key={clip.id} clip={clip} clips={clips} draggable onDragStart={() => setDraggedId(clip.id)} onDragOver={event => event.preventDefault()} onDrop={() => void dropOn(clip.id)} onDelete={() => void removeClip(clip)} onChanged={() => void refreshPageHighlights()} />)}
    </section>}
    {view === 'navigation' && <section className="navigation-workspace">
      <div className="navigation-switch" role="group" aria-label="导航类型">
        <button className={navigationMode === 'conversation' ? 'active' : ''} onClick={() => setNavigationMode('conversation')}>对话图</button>
        <button disabled={!notebook} className={navigationMode === 'clips' ? 'active' : ''} onClick={() => setNavigationMode('clips')}>摘录图 {notebook && <span>{clips.length}</span>}</button>
      </div>
      {navigationMode === 'conversation'
        ? <ConversationMap onShowClips={showClipsFromConversation} focusClipId={conversationFocusClipId} targetTabId={conversationTargetTabId} onFocusHandled={clearConversationFocus} />
        : notebook ? <MindMap notebook={notebook} clips={clips} focusedClipId={focusedClipId} onFocusHandled={clearClipMapFocus} onShowConversation={showConversationFromClip} /> : <EmptyState />}
    </section>}
    {view === 'preview' && notebook && <section className="preview"><pre>{markdown}</pre></section>}

    {notebook && <footer className="export-bar">
        <div className="storage" title={`${Math.round(bytes / 1024)} KB / 10 MB`}><i style={{ width: `${usage}%` }} /></div>
        {usage >= 80 && <p className="warning">本地空间接近上限，请导出后清理。</p>}
        <div className="export-actions"><button onClick={() => void copy()} disabled={!clips.length}>复制 Markdown</button><button className="primary" onClick={() => void download()} disabled={!clips.length}>下载 .md</button></div>
    </footer>}
    {notice && <div className="notice">{notice}</div>}
  </main>;
}

function CreateNotebook({ onCreate, canCancel, onCancel }: { onCreate: (title: string) => void; canCancel: boolean; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  return <form className="create-card" onSubmit={event => { event.preventDefault(); void onCreate(title.trim()); }}>
    <strong>创建主题笔记</strong><p>之后的摘录会自动加入这里。</p>
    <input autoFocus value={title} maxLength={80} placeholder="例如：产品设计方法" onChange={event => setTitle(event.target.value)} />
    <div><button className="primary" type="submit">创建</button>{canCancel && <button type="button" onClick={onCancel}>取消</button>}</div>
  </form>;
}

function NotebookEditor({ notebook }: { notebook: Notebook }) {
  const [title, setTitle] = useState(notebook.title);
  const [description, setDescription] = useState(notebook.description);
  useEffect(() => { setTitle(notebook.title); setDescription(notebook.description); }, [notebook.id, notebook.title, notebook.description]);
  const save = () => { if (title.trim()) void updateNotebook(notebook.id, { title, description }); };
  return <section className="notebook-editor">
    <input className="title-input" value={title} maxLength={80} onChange={event => setTitle(event.target.value)} onBlur={save} />
    <textarea value={description} maxLength={500} placeholder="给这篇笔记写一句说明（可选）" onChange={event => setDescription(event.target.value)} onBlur={save} />
  </section>;
}

function ClipCard({ clip, clips, onDelete, onChanged, ...dragProps }: { clip: Clip; clips: Clip[]; onDelete: () => void; onChanged: () => void } & React.HTMLAttributes<HTMLElement>) {
  const [annotation, setAnnotation] = useState(clip.annotation);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => setAnnotation(clip.annotation), [clip.annotation]);
  const openSource = () => openClipSource(clip);
  const activateCard = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('button, textarea, input, select, a, [contenteditable="true"]')) return;
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
    if ('key' in event) event.preventDefault();
    void openSource();
  };
  return <article ref={cardRef} id={`clip-${clip.id}`} className="clip-card" role="button" tabIndex={0} title="点击返回原文位置" onClick={activateCard} onKeyDown={activateCard} {...dragProps}>
    <div className="clip-meta"><span className={`platform ${clip.platform}`}>{clip.platform}</span><span>{clip.messageRole === 'assistant' ? 'AI' : clip.messageRole === 'user' ? '我' : '未知角色'}</span><span>{new Date(clip.capturedAt).toLocaleDateString('zh-CN')}</span><span className={clip.anchor.status === 'unresolved' ? 'unresolved' : 'resolved'}>{clip.anchor.status === 'unresolved' ? '未能重新定位' : '已定位'}</span><span className="drag">⠿</span></div>
    <blockquote>{clip.originalText}</blockquote>
    <textarea value={annotation} maxLength={2000} placeholder="写下你的批注…" onChange={event => setAnnotation(event.target.value)} onBlur={() => void updateClip(clip.id, { annotation })} />
    <label className="parent-picker"><span>连接到</span><select value={clip.parentClipId ?? ''} onChange={event => void setClipParent(clip.id, event.target.value || undefined)}><option value="">笔记主题（根级）</option>{validParentOptions(clip, clips).map(item => <option key={item.id} value={item.id}>{clipLabel(item)}</option>)}</select></label>
    <div className="card-actions"><div className="colors">{COLORS.map(color => <button key={color} aria-label={`${color} 高亮`} className={clip.highlightColor === color ? 'selected' : ''} data-color={color} onClick={() => { void updateClip(clip.id, { highlightColor: color }).then(onChanged); }} />)}</div><button onClick={() => void openSource()}>来源 ↗</button><button className="danger-ghost" onClick={onDelete}>移除</button></div>
  </article>;
}

type MapNodeData = { label: React.ReactNode; color: string; clip?: Clip };
type MapNode = Node<MapNodeData>;

function MindMap({ notebook, clips, focusedClipId, onFocusHandled, onShowConversation }: { notebook: Notebook; clips: Clip[]; focusedClipId?: string; onFocusHandled: () => void; onShowConversation: (clip: Clip) => void }) {
  const [selectedClipId, setSelectedClipId] = useState(focusedClipId);
  const createGraph = useCallback((preferSavedPositions = true) => {
    const layout = layoutMindMap(notebook, clips);
    const positions = preferSavedPositions ? { ...layout.positions, ...notebook.mindMapPositions } : layout.positions;
    const graphNodes: MapNode[] = [
      {
        id: MIND_MAP_ROOT_ID,
        type: 'input',
        position: positions[MIND_MAP_ROOT_ID]!,
        data: { color: 'root', label: <><strong>{notebook.title}</strong><small>{clips.length} 条摘录</small></> },
        sourcePosition: Position.Right,
        draggable: true,
        deletable: false,
        className: 'flow-node flow-root'
      },
      ...clips.map(clip => ({
        id: clip.id,
        type: 'default',
        position: positions[clip.id]!,
        data: {
          color: clip.highlightColor,
          clip,
          label: <><span className={`platform ${clip.platform}`}>{clip.platform}</span><strong>{clipLabel(clip, 92)}</strong>{clip.annotation && <small>{clip.annotation.slice(0, 60)}</small>}</>
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
        deletable: false,
        className: `flow-node flow-clip color-${clip.highlightColor}${clip.id === selectedClipId ? ' flow-focus' : ''}`
      }))
    ];
    const graphEdges: Edge[] = layout.edges.map(edge => ({
      ...edge,
      type: 'smoothstep',
      deletable: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13 },
      style: { strokeWidth: 1.8 }
    }));
    return { graphNodes, graphEdges };
  }, [notebook, clips, selectedClipId]);

  const initial = useMemo(() => createGraph(), [createGraph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(initial.graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.graphEdges);
  const [instance, setInstance] = useState<import('@xyflow/react').ReactFlowInstance<MapNode, Edge> | null>(null);

  useEffect(() => {
    const next = createGraph();
    setNodes(next.graphNodes);
    setEdges(next.graphEdges);
  }, [createGraph, setEdges, setNodes]);

  useEffect(() => {
    if (!focusedClipId) return;
    setSelectedClipId(focusedClipId);
    const target = nodes.find(node => node.id === focusedClipId);
    if (!target || !instance) return;
    window.setTimeout(() => void instance.fitView({ nodes: [target], padding: 1.4, maxZoom: 1.15, duration: 300 }), 20);
    onFocusHandled();
  }, [focusedClipId, instance, nodes, onFocusHandled]);

  const savePosition = useCallback<OnNodeDrag<MapNode>>((_event, node) => {
    void updateMindMapPositions(notebook.id, { [node.id]: node.position });
  }, [notebook.id]);

  const connect = useCallback(async ({ source, target }: Connection) => {
    if (!source || !target || target === MIND_MAP_ROOT_ID || source === target) return;
    const changed = await setClipParent(target, source === MIND_MAP_ROOT_ID ? undefined : source);
    if (!changed) return;
    const layout = layoutMindMap(notebook, clips.map(clip => clip.id === target ? { ...clip, parentClipId: source === MIND_MAP_ROOT_ID ? undefined : source } : clip));
    setEdges(layout.edges.map(edge => ({ ...edge, type: 'smoothstep', deletable: false, markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13 } })));
  }, [clips, notebook, setEdges]);

  const arrange = useCallback(() => {
    const next = createGraph(false);
    setNodes(next.graphNodes);
    setEdges(next.graphEdges);
    void updateMindMapPositions(notebook.id, Object.fromEntries(next.graphNodes.map(node => [node.id, node.position])));
    window.setTimeout(() => void instance?.fitView({ padding: .22, duration: 350 }), 20);
  }, [createGraph, instance, notebook.id, setEdges, setNodes]);

  if (!clips.length) return <EmptyState />;
  return <section className="mind-map" aria-label="摘录思维导图">
    <div className="map-toolbar">
      <div><strong>自由画布</strong><span>拖动节点或空白区域</span></div>
      <button disabled={!selectedClipId} onClick={() => { const clip = clips.find(item => item.id === selectedClipId); if (clip) onShowConversation(clip); }}>对话位置</button>
      <button onClick={arrange}>整理布局</button>
      <button onClick={() => void instance?.fitView({ padding: .22, duration: 350 })}>适应屏幕</button>
    </div>
    <div className="map-canvas">
      <ReactFlow<MapNode, Edge>
        nodes={nodes}
        edges={edges}
        onInit={setInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={savePosition}
        onNodeClick={(_event, node) => { if (node.data.clip) setSelectedClipId(node.data.clip.id); }}
        onNodeDoubleClick={(_event, node) => { if (node.data.clip) void openClipSource(node.data.clip); }}
        onConnect={connect}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: .22 }}
        minZoom={.2}
        maxZoom={2.2}
        zoomOnDoubleClick={false}
        nodesConnectable
        nodesFocusable
        edgesFocusable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="#cfd8d6" />
        <MiniMap pannable zoomable nodeColor={node => node.id === MIND_MAP_ROOT_ID ? '#eda861' : mapNodeColor(String(node.data.color))} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <p className="map-help">拖动节点调整位置，拖动空白处移动画布，滚轮缩放；从节点右侧圆点拖到另一节点左侧即可连接。双击摘录返回原文。</p>
  </section>;
}

function mapNodeColor(color: string): string {
  return ({ yellow: '#e1c85d', green: '#63a87c', blue: '#6a93cf', pink: '#cb7899' } as Record<string, string>)[color] ?? '#8b8f88';
}

function clipLabel(clip: Clip, maxLength = 48): string {
  const text = clip.originalText.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

async function openClipSource(clip: Clip): Promise<number | undefined> {
  let origin: string;
  try {
    origin = new URL(clip.conversationUrl).origin;
  } catch {
    return undefined;
  }
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  let tab = tabs.find(item => normalizeConversationUrl(item.url) === normalizeConversationUrl(clip.conversationUrl));
  if (tab?.id === undefined) tab = await chrome.tabs.create({ url: clip.conversationUrl, active: true });
  if (tab.id === undefined) return undefined;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  void sendScrollRequest(tab.id, clip.id);
  return tab.id;
}

function normalizeConversationUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  } catch { return undefined; }
}

async function sendScrollRequest(tabId: number, clipId: string): Promise<void> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        version: 1,
        type: 'SCROLL_TO_CLIP',
        clipId
      } satisfies ExtensionMessage) as ExtensionMessage;
      if (response.type === 'SCROLL_TO_CLIP_RESULT') return;
    } catch {
      // A newly opened conversation may not have its content script ready yet.
    }
    await new Promise(resolve => window.setTimeout(resolve, 250));
  }
}

function EmptyState() {
  return <div className="empty"><div>✦</div><strong>还没有摘录</strong><p>在支持的 AI 对话中选中文字，然后点击“摘录”。</p><kbd>⌃⇧S</kbd></div>;
}

async function refreshPageHighlights(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter(tab => tab.id !== undefined && /chatgpt\.com|claude\.ai|gemini\.google\.com/.test(tab.url ?? '')).map(tab => chrome.tabs.sendMessage(tab.id!, { version: 1, type: 'REFRESH_HIGHLIGHTS' } satisfies ExtensionMessage).catch(() => undefined)));
}
