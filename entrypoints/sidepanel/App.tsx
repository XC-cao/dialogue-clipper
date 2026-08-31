import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, ConnectionLineType, Controls, MiniMap, Position,
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
  restoreDeletedClip, selectNotebook, setClipParent, updateClip, updateMindMapPositions, updateNotebook,
  type DeletedClipSnapshot
} from '../../lib/storage';
import type { ExtensionMessage } from '../../lib/messages';
import {
  clearFocusRequest, downloadTextFile, focusRequestKey, localStorageBytes, readFocusRequest
} from '../../lib/extension-platform';
import { isSameConversationUrl } from '../../lib/conversation-url';
import { ConversationMap } from './ConversationMap';
import { sendContentMessage } from '../../lib/tab-content';

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];

export function App() {
  const [state, setState] = useState<StoredState>(EMPTY_STATE);
  const [view, setView] = useState<'clips' | 'navigation' | 'preview'>('clips');
  const [navigationMode, setNavigationMode] = useState<'conversation' | 'clips'>('conversation');
  const [focusedClipId, setFocusedClipId] = useState<string>();
  const [conversationFocusClip, setConversationFocusClip] = useState<Clip>();
  const [conversationTargetTabId, setConversationTargetTabId] = useState<number>();
  const [cardFocusClipId, setCardFocusClipId] = useState<string>();
  const [notice, setNotice] = useState('');
  const [undoDelete, setUndoDelete] = useState<{ snapshot: DeletedClipSnapshot; label: string }>();
  const undoTimerRef = useRef<number | undefined>(undefined);
  const [bytes, setBytes] = useState(0);
  const [creating, setCreating] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const notebook = state.currentNotebookId ? state.notebooks[state.currentNotebookId] : undefined;
  const clips = useMemo(() => notebook?.clipIds.map(id => state.clips[id]).filter((clip): clip is Clip => Boolean(clip)) ?? [], [notebook, state.clips]);
  const markdown = notebook ? renderMarkdown(notebook, clips) : '';

  const refresh = async () => {
    setState(await loadState());
    setBytes(await localStorageBytes());
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
      const current = await readFocusRequest();
      if (current && typeof current === 'object' && (current as { clipId?: unknown }).clipId === id) {
        await clearFocusRequest();
      }
    };
    void readFocusRequest().then(value => void focusClip(value));
    const listener = (_changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local') void refresh(); };
    chrome.storage.onChanged.addListener(listener);
    const focus = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if ((area === 'session' || area === 'local') && changes[focusRequestKey()]) {
        void focusClip(changes[focusRequestKey()]?.newValue);
      }
    };
    chrome.storage.onChanged.addListener(focus);
    return () => { chrome.storage.onChanged.removeListener(listener); chrome.storage.onChanged.removeListener(focus); };
  }, []);

  useEffect(() => () => {
    if (undoTimerRef.current !== undefined) window.clearTimeout(undoTimerRef.current);
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

  const offerUndo = (snapshot: DeletedClipSnapshot, label: string) => {
    if (undoTimerRef.current !== undefined) window.clearTimeout(undoTimerRef.current);
    setUndoDelete({ snapshot, label });
    undoTimerRef.current = window.setTimeout(() => {
      setUndoDelete(undefined);
      undoTimerRef.current = undefined;
    }, 7000);
  };

  const undoLastDelete = async () => {
    if (!undoDelete) return;
    if (undoTimerRef.current !== undefined) window.clearTimeout(undoTimerRef.current);
    const restored = await restoreDeletedClip(undoDelete.snapshot);
    setUndoDelete(undefined);
    undoTimerRef.current = undefined;
    if (!restored) {
      notify('Unable to restore this clip because its notebook no longer exists.');
      return;
    }
    await refreshPageHighlights();
    notify('Clip restored');
  };

  const chooseNotebook = async (id: string) => {
    await selectNotebook(id);
    if (state.pendingCaptures.length) await assignPending(id);
  };

  const create = async (title: string) => {
    const notebook = await createNotebook(title || 'Untitled notebook');
    if (state.pendingCaptures.length) await assignPending(notebook.id);
    setCreating(false);
  };

  const removeNotebook = async () => {
    if (!notebook || !confirm(`Delete “${notebook.title}” and all of its clips? This cannot be undone.`)) return;
    await deleteNotebook(notebook.id);
    await refreshPageHighlights();
  };

  const removeClip = async (clip: Clip) => {
    if (!confirm('Delete this clip? Its child nodes will be reconnected to the notebook topic. You can undo for a few seconds.')) return false;
    const snapshot = await deleteClip(clip.id);
    if (!snapshot) return false;
    offerUndo(snapshot, clipLabel(clip));
    await refreshPageHighlights();
    return true;
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

  const copy = async () => { await navigator.clipboard.writeText(markdown); notify('Markdown copied'); };
  const download = async () => {
    if (!notebook) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    try {
      await downloadTextFile(url, markdownFilename(notebook));
      notify('Markdown download started');
    } finally { window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
  };

  const usage = Math.min(100, bytes / 10_485_760 * 100);

  const showClipsFromConversation = useCallback(async (clipIds: string[]) => {
    const candidates = clipIds.map(id => state.clips[id]).filter((clip): clip is Clip => Boolean(clip));
    if (!candidates.length) return;
    const inCurrentNotebook = candidates.find(clip => clip.notebookId === notebook?.id);
    const notebookIds = new Set(candidates.map(clip => clip.notebookId));
    if (!inCurrentNotebook && notebookIds.size > 1) {
      notify('This message has clips in multiple notebooks. Select a notebook first.');
      return;
    }
    const target = inCurrentNotebook ?? candidates[0]!;
    if (target.notebookId !== notebook?.id) {
      await selectNotebook(target.notebookId);
      await refresh();
    } else if (notebookIds.size > 1) {
      notify('Showing clips from this notebook. This message also has clips elsewhere.');
    }
    setFocusedClipId(target.id);
    setNavigationMode('clips');
    setView('navigation');
  }, [notebook?.id, state.clips]);

  const showConversationFromClip = useCallback((clip: Clip) => {
    setConversationFocusClip(clip);
    setConversationTargetTabId(undefined);
    setNavigationMode('conversation');
    setView('navigation');
    void openClipSource(clip).then(tabId => {
      if (tabId !== undefined) setConversationTargetTabId(tabId);
    });
  }, []);

  const clearClipMapFocus = useCallback(() => setFocusedClipId(undefined), []);
  const clearConversationFocus = useCallback(() => {
    setConversationFocusClip(undefined);
    setConversationTargetTabId(undefined);
  }, []);

  return <main>
    <header className="app-header">
      <div><div className="eyebrow">LOCAL-FIRST</div><h1>Dialogue Clipper</h1></div>
      <button className="icon-button" title="New notebook" aria-label="New notebook" onClick={() => setCreating(true)}>＋</button>
    </header>

    {state.pendingCaptures.length > 0 && <section className="pending">
      <strong>{state.pendingCaptures.length} {state.pendingCaptures.length === 1 ? 'clip is' : 'clips are'} waiting to be saved</strong>
      <span>Create or select a notebook to file them.</span>
    </section>}

    {(creating || Object.keys(state.notebooks).length === 0) && <CreateNotebook onCreate={create} canCancel={Object.keys(state.notebooks).length > 0} onCancel={() => setCreating(false)} />}

    {Object.keys(state.notebooks).length > 0 && <>
      <label className="field-label" htmlFor="notebook-select">Current notebook</label>
      <div className="notebook-row">
        <select id="notebook-select" value={notebook?.id ?? ''} onChange={event => void chooseNotebook(event.target.value)}>
          {Object.values(state.notebooks).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="danger-ghost" title="Delete notebook" onClick={() => void removeNotebook()}>Delete</button>
      </div>
    </>}

    {notebook && <NotebookEditor notebook={notebook} />}
    <nav className="tabs">
      <button className={view === 'clips' ? 'active' : ''} disabled={!notebook} onClick={() => setView('clips')}>Clips {notebook && <span>{clips.length}</span>}</button>
      <button className={view === 'navigation' ? 'active' : ''} onClick={() => setView('navigation')}>Navigate</button>
      <button className={view === 'preview' ? 'active' : ''} disabled={!notebook} onClick={() => setView('preview')}>Markdown</button>
    </nav>

    {view === 'clips' && notebook && <section className="clip-list">
        {clips.length === 0 && <EmptyState />}
        {clips.map(clip => <ClipCard key={clip.id} clip={clip} clips={clips} draggable onDragStart={() => setDraggedId(clip.id)} onDragOver={event => event.preventDefault()} onDrop={() => void dropOn(clip.id)} onDelete={() => void removeClip(clip)} onChanged={() => void refreshPageHighlights()} />)}
    </section>}
    {view === 'navigation' && <section className="navigation-workspace">
      <div className="navigation-switch" role="group" aria-label="Navigation type">
        <button className={navigationMode === 'conversation' ? 'active' : ''} onClick={() => setNavigationMode('conversation')}>Conversation map</button>
        <button disabled={!notebook} className={navigationMode === 'clips' ? 'active' : ''} onClick={() => setNavigationMode('clips')}>Clip map {notebook && <span>{clips.length}</span>}</button>
      </div>
      {navigationMode === 'conversation'
        ? <ConversationMap onShowClips={showClipsFromConversation} focusClip={conversationFocusClip} targetTabId={conversationTargetTabId} onFocusHandled={clearConversationFocus} />
        : notebook ? <MindMap notebook={notebook} clips={clips} focusedClipId={focusedClipId} onFocusHandled={clearClipMapFocus} onShowConversation={showConversationFromClip} onDelete={removeClip} /> : <EmptyState />}
    </section>}
    {view === 'preview' && notebook && <section className="preview"><pre>{markdown}</pre></section>}

    {notebook && <footer className="export-bar">
        <div className="storage" title={`${Math.round(bytes / 1024)} KB / 10 MB`}><i style={{ width: `${usage}%` }} /></div>
        {usage >= 80 && <p className="warning">Local storage is almost full. Export your notes, then remove old data.</p>}
        <div className="export-actions"><button onClick={() => void copy()} disabled={!clips.length}>Copy Markdown</button><button className="primary" onClick={() => void download()} disabled={!clips.length}>Download .md</button></div>
    </footer>}
    {undoDelete && <div className="notice undo-notice" role="region" aria-label="Deletion status" aria-live="polite"><span>Deleted “{undoDelete.label}”</span><button autoFocus onClick={() => void undoLastDelete()}>Undo</button></div>}
    {!undoDelete && notice && <div className="notice" role="status" aria-live="polite">{notice}</div>}
  </main>;
}

function CreateNotebook({ onCreate, canCancel, onCancel }: { onCreate: (title: string) => void; canCancel: boolean; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  return <form className="create-card" onSubmit={event => { event.preventDefault(); void onCreate(title.trim()); }}>
    <strong>Create a topic notebook</strong><p>New clips will be added here automatically.</p>
    <input autoFocus value={title} maxLength={80} placeholder="For example: Product design methods" onChange={event => setTitle(event.target.value)} />
    <div><button className="primary" type="submit">Create</button>{canCancel && <button type="button" onClick={onCancel}>Cancel</button>}</div>
  </form>;
}

function NotebookEditor({ notebook }: { notebook: Notebook }) {
  const [title, setTitle] = useState(notebook.title);
  const [description, setDescription] = useState(notebook.description);
  useEffect(() => { setTitle(notebook.title); setDescription(notebook.description); }, [notebook.id, notebook.title, notebook.description]);
  const save = () => { if (title.trim()) void updateNotebook(notebook.id, { title, description }); };
  return <section className="notebook-editor">
    <input className="title-input" value={title} maxLength={80} onChange={event => setTitle(event.target.value)} onBlur={save} />
    <textarea value={description} maxLength={500} placeholder="Add a short description (optional)" onChange={event => setDescription(event.target.value)} onBlur={save} />
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
  return <article ref={cardRef} id={`clip-${clip.id}`} className="clip-card" role="button" tabIndex={0} title="Open the source message" onClick={activateCard} onKeyDown={activateCard} {...dragProps}>
    <div className="clip-meta"><span className={`platform ${clip.platform}`}>{clip.platform}</span><span>{clip.messageRole === 'assistant' ? 'AI' : clip.messageRole === 'user' ? 'You' : 'Unknown role'}</span><span>{new Date(clip.capturedAt).toLocaleDateString('en-US')}</span><span className={clip.anchor.status === 'unresolved' ? 'unresolved' : 'resolved'}>{clip.anchor.status === 'unresolved' ? 'Source not found' : 'Source found'}</span><span className="drag">⠿</span></div>
    <blockquote>{clip.originalText}</blockquote>
    <textarea value={annotation} maxLength={2000} placeholder="Add your annotation…" onChange={event => setAnnotation(event.target.value)} onBlur={() => void updateClip(clip.id, { annotation })} />
    <label className="parent-picker"><span>Connect to</span><select value={clip.parentClipId ?? ''} onChange={event => void setClipParent(clip.id, event.target.value || undefined)}><option value="">Notebook topic (root)</option>{validParentOptions(clip, clips).map(item => <option key={item.id} value={item.id}>{clipLabel(item)}</option>)}</select></label>
    <div className="card-actions"><div className="colors">{COLORS.map(color => <button key={color} aria-label={`${color} highlight`} className={clip.highlightColor === color ? 'selected' : ''} data-color={color} onClick={() => { void updateClip(clip.id, { highlightColor: color }).then(onChanged); }} />)}</div><button onClick={() => void openSource()}>Source ↗</button><button className="danger-ghost" onClick={onDelete}>Remove</button></div>
  </article>;
}

type MapNodeData = { label: React.ReactNode; color: string; clip?: Clip };
type MapNode = Node<MapNodeData>;

function MindMap({ notebook, clips, focusedClipId, onFocusHandled, onShowConversation, onDelete }: { notebook: Notebook; clips: Clip[]; focusedClipId?: string; onFocusHandled: () => void; onShowConversation: (clip: Clip) => void; onDelete: (clip: Clip) => Promise<boolean> }) {
  const [selectedClipId, setSelectedClipId] = useState(focusedClipId);
  const [detailOpen, setDetailOpen] = useState(Boolean(focusedClipId));
  const createGraph = useCallback((preferSavedPositions = true) => {
    const layout = layoutMindMap(notebook, clips);
    const positions = preferSavedPositions ? { ...layout.positions, ...notebook.mindMapPositions } : layout.positions;
    const graphNodes: MapNode[] = [
      {
        id: MIND_MAP_ROOT_ID,
        type: 'input',
        position: positions[MIND_MAP_ROOT_ID]!,
        data: { color: 'root', label: <><strong>{notebook.title}</strong><small>{clips.length} {clips.length === 1 ? 'clip' : 'clips'}</small></> },
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
    setDetailOpen(true);
    const target = nodes.find(node => node.id === focusedClipId);
    if (!target || !instance) return;
    window.setTimeout(() => void instance.fitView({ nodes: [target], padding: 1.4, maxZoom: 1.15, duration: 300 }), 20);
    onFocusHandled();
  }, [focusedClipId, instance, nodes, onFocusHandled]);

  useEffect(() => {
    if (selectedClipId && !clips.some(clip => clip.id === selectedClipId)) {
      setSelectedClipId(undefined);
      setDetailOpen(false);
    }
  }, [clips, selectedClipId]);

  const selectedClip = clips.find(clip => clip.id === selectedClipId);

  const savePosition = useCallback<OnNodeDrag<MapNode>>((_event, node) => {
    void updateMindMapPositions(notebook.id, { [node.id]: node.position });
  }, [notebook.id]);

  const connect = useCallback(async ({ source, target }: Connection) => {
    if (!source || !target || target === MIND_MAP_ROOT_ID || source === target) return;
    const changed = await setClipParent(target, source === MIND_MAP_ROOT_ID ? undefined : source);
    if (!changed) return;
    const layout = layoutMindMap(notebook, clips.map(clip => clip.id === target ? { ...clip, parentClipId: source === MIND_MAP_ROOT_ID ? undefined : source } : clip));
    setEdges(layout.edges.map(edge => ({ ...edge, type: 'smoothstep', deletable: false })));
  }, [clips, notebook, setEdges]);

  const arrange = useCallback(() => {
    const next = createGraph(false);
    setNodes(next.graphNodes);
    setEdges(next.graphEdges);
    void updateMindMapPositions(notebook.id, Object.fromEntries(next.graphNodes.map(node => [node.id, node.position])));
    window.setTimeout(() => void instance?.fitView({ padding: .22, duration: 350 }), 20);
  }, [createGraph, instance, notebook.id, setEdges, setNodes]);

  const removeSelected = useCallback(async () => {
    const clip = clips.find(item => item.id === selectedClipId);
    if (!clip) return;
    if (await onDelete(clip)) {
      setSelectedClipId(undefined);
      setDetailOpen(false);
    }
  }, [clips, onDelete, selectedClipId]);

  const handleMapKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && detailOpen) {
      event.preventDefault();
      setDetailOpen(false);
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    if (event.target instanceof Element && event.target.closest('button, input, textarea, select, [contenteditable="true"]')) return;
    if (!selectedClipId) return;
    event.preventDefault();
    void removeSelected();
  };

  if (!clips.length) return <EmptyState />;
  return <section className="mind-map" aria-label="Clip mind map" onKeyDown={handleMapKeyDown}>
    <div className="map-toolbar">
      <div><strong>Freeform canvas</strong><span>Drag nodes or the empty canvas</span></div>
      <button disabled={!selectedClipId} title="Open this clip's source conversation and focus its message in the conversation map" onClick={() => { const clip = clips.find(item => item.id === selectedClipId); if (clip) onShowConversation(clip); }}>In conversation</button>
      <button className="map-delete" disabled={!selectedClipId} title="Delete selected clip (Delete or Backspace)" onClick={() => void removeSelected()}>Delete</button>
      <button onClick={arrange}>Auto-arrange</button>
      <button onClick={() => void instance?.fitView({ padding: .22, duration: 350 })}>Fit view</button>
    </div>
    <div className={`map-canvas${detailOpen && selectedClip ? ' detail-is-open' : ''}`}>
      <ReactFlow<MapNode, Edge>
        nodes={nodes}
        edges={edges}
        onInit={setInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={savePosition}
        onNodeClick={(_event, node) => {
          setSelectedClipId(node.data.clip?.id);
          setDetailOpen(Boolean(node.data.clip));
        }}
        onPaneClick={() => { setSelectedClipId(undefined); setDetailOpen(false); }}
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
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#d8d0c5" />
        <MiniMap pannable zoomable nodeColor={node => node.id === MIND_MAP_ROOT_ID ? '#eb6c36' : mapNodeColor(String(node.data.color))} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <aside className={`map-detail${detailOpen && selectedClip ? ' open' : ''}`} aria-hidden={!detailOpen || !selectedClip} aria-label="Full clip details" inert={!detailOpen || !selectedClip}>
        {selectedClip && <MindMapDetail clip={selectedClip} onClose={() => setDetailOpen(false)} onShowConversation={() => onShowConversation(selectedClip)} />}
      </aside>
    </div>
    <p className="map-help">Click a clip to read its full text and edit its annotation. “In conversation” opens the source conversation and focuses the containing message in the conversation map. Double-click a clip to jump directly to its source text.</p>
  </section>;
}

function MindMapDetail({ clip, onClose, onShowConversation }: { clip: Clip; onClose: () => void; onShowConversation: () => void }) {
  const [annotation, setAnnotation] = useState(clip.annotation);
  useEffect(() => setAnnotation(clip.annotation), [clip.id, clip.annotation]);
  return <div className="map-detail-content">
    <header>
      <div><span className={`platform ${clip.platform}`}>{clip.platform}</span><strong>Full clip</strong></div>
      <button className="map-detail-close" aria-label="Close full clip" title="Close (Escape)" onClick={onClose}>×</button>
    </header>
    <div className="map-detail-meta"><span>{clip.messageRole === 'assistant' ? 'AI' : clip.messageRole === 'user' ? 'You' : 'Unknown role'}</span><span>{new Date(clip.capturedAt).toLocaleDateString('en-US')}</span></div>
    <section className="map-detail-original" aria-labelledby={`full-clip-${clip.id}`}>
      <div><strong id={`full-clip-${clip.id}`}>Original excerpt</strong><span>Read-only</span></div>
      <blockquote>{clip.originalText}</blockquote>
    </section>
    <label className="map-detail-annotation"><span>Your annotation</span><textarea value={annotation} maxLength={2000} placeholder="Add your annotation…" onChange={event => setAnnotation(event.target.value)} onBlur={() => void updateClip(clip.id, { annotation })} /></label>
    <footer><button onClick={() => void openClipSource(clip)}>Source ↗</button><button className="primary" title="Open this clip's source conversation and focus its message in the conversation map" onClick={onShowConversation}>In conversation</button></footer>
  </div>;
}

function mapNodeColor(color: string): string {
  return ({ yellow: '#c36a3d', green: '#5c7c68', blue: '#667b9d', pink: '#b87378' } as Record<string, string>)[color] ?? '#8b8479';
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
  let tab = tabs.find(item => isSameConversationUrl(item.url, clip.conversationUrl));
  if (tab?.id === undefined) tab = await chrome.tabs.create({ url: clip.conversationUrl, active: true });
  if (tab.id === undefined) return undefined;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  await sendScrollRequest(tab.id, clip.id);
  return tab.id;
}

async function sendScrollRequest(tabId: number, clipId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      const response = await sendContentMessage(tabId, {
        version: 2,
        type: 'SCROLL_TO_CLIP',
        clipId
      }, 2);
      if (response?.type === 'SCROLL_TO_CLIP_RESULT') return response.ok;
    } catch {
      // A newly opened conversation may not have its content script ready yet.
    }
    await new Promise(resolve => window.setTimeout(resolve, 250));
  }
  return false;
}

function EmptyState() {
  return <div className="empty"><div>✦</div><strong>No clips yet</strong><p>Select text in a supported AI conversation, then click “Clip”.</p><kbd>⌃⇧S</kbd></div>;
}

async function refreshPageHighlights(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter(tab => tab.id !== undefined && /chatgpt\.com|claude\.ai|gemini\.google\.com/.test(tab.url ?? '')).map(tab => chrome.tabs.sendMessage(tab.id!, { version: 1, type: 'REFRESH_HIGHLIGHTS' } satisfies ExtensionMessage).catch(() => undefined)));
}
