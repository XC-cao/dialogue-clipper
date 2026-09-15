import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, ConnectionLineType, Controls, MiniMap, Position,
  ReactFlow, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type OnNodeDrag
} from '@xyflow/react';
import { markdownFilename, renderMarkdown } from '../../lib/markdown';
import {
  conversationExportFilename, isConversationExport, renderConversationExportMarkdown,
  type ConversationExport
} from '../../lib/conversation-export';
import { resolveClipFocus, validParentOptions } from '../../lib/clip-tree';
import { layoutMindMap, MIND_MAP_ROOT_ID } from '../../lib/mind-map-layout';
import type { Clip, HighlightColor, Notebook, StoredState } from '../../lib/models';
import { EMPTY_STATE } from '../../lib/models';
import {
  assignPending, createNotebook, deleteClip, deleteNotebook, loadState, moveClipToNotebook, reorderClips,
  restoreDeletedClip, restoreMovedClip, selectNotebook, setClipParent, updateClip, updateMindMapPositions, updateNotebook,
  type DeletedClipSnapshot, type MovedClipSnapshot
} from '../../lib/storage';
import type { ExtensionMessage } from '../../lib/messages';
import {
  clearFocusRequest, downloadTextFile, focusRequestKey, localStorageBytes, readFocusRequest
} from '../../lib/extension-platform';
import { isSameConversationUrl, isSupportedConversationUrl } from '../../lib/conversation-url';
import { ConversationMap } from './ConversationMap';
import { sendContentMessage } from '../../lib/tab-content';
import { formatDate, t } from '../../lib/i18n';

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];

export function App() {
  const [state, setState] = useState<StoredState>(EMPTY_STATE);
  const [view, setView] = useState<'clips' | 'navigation' | 'preview'>('clips');
  const [markdownSource, setMarkdownSource] = useState<'notebook' | 'conversation'>('notebook');
  const [conversationExport, setConversationExport] = useState<ConversationExport>();
  const [conversationExportTabId, setConversationExportTabId] = useState<number>();
  const [conversationExportLoading, setConversationExportLoading] = useState(false);
  const [conversationExportError, setConversationExportError] = useState('');
  const [conversationExportStale, setConversationExportStale] = useState(false);
  const [navigationMode, setNavigationMode] = useState<'conversation' | 'clips'>('conversation');
  const [focusedClipIds, setFocusedClipIds] = useState<string[]>([]);
  const [conversationFocusClip, setConversationFocusClip] = useState<Clip>();
  const [conversationTargetTabId, setConversationTargetTabId] = useState<number>();
  const [cardFocusClipId, setCardFocusClipId] = useState<string>();
  const [notice, setNotice] = useState('');
  const [undoDelete, setUndoDelete] = useState<{ snapshot: DeletedClipSnapshot; label: string }>();
  const [undoMove, setUndoMove] = useState<{ snapshot: MovedClipSnapshot; targetTitle: string }>();
  const undoTimerRef = useRef<number | undefined>(undefined);
  const [bytes, setBytes] = useState(0);
  const [creating, setCreating] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const notebook = state.currentNotebookId ? state.notebooks[state.currentNotebookId] : undefined;
  const notebooks = useMemo(() => Object.values(state.notebooks).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [state.notebooks]);
  const clips = useMemo(() => notebook?.clipIds.map(id => state.clips[id]).filter((clip): clip is Clip => Boolean(clip)) ?? [], [notebook, state.clips]);
  const notebookMarkdown = notebook ? renderMarkdown(notebook, clips) : '';
  const conversationMarkdown = conversationExport ? renderConversationExportMarkdown(conversationExport) : '';
  const exportSource = view === 'preview' ? markdownSource : 'notebook';
  const markdown = exportSource === 'conversation' ? conversationMarkdown : notebookMarkdown;

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
    const activated = ({ tabId }: { tabId: number }) => {
      if (conversationExportTabId !== undefined && tabId !== conversationExportTabId) setConversationExportStale(true);
    };
    const updated = (tabId: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (conversationExportTabId === tabId && change.url) setConversationExportStale(true);
    };
    chrome.tabs.onActivated.addListener(activated);
    chrome.tabs.onUpdated.addListener(updated);
    return () => {
      chrome.tabs.onActivated.removeListener(activated);
      chrome.tabs.onUpdated.removeListener(updated);
    };
  }, [conversationExportTabId]);

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
    setUndoMove(undefined);
    setUndoDelete({ snapshot, label });
    undoTimerRef.current = window.setTimeout(() => {
      setUndoDelete(undefined);
      undoTimerRef.current = undefined;
    }, 7000);
  };

  const offerMoveUndo = (snapshot: MovedClipSnapshot, targetTitle: string) => {
    if (undoTimerRef.current !== undefined) window.clearTimeout(undoTimerRef.current);
    setUndoDelete(undefined);
    setUndoMove({ snapshot, targetTitle });
    undoTimerRef.current = window.setTimeout(() => {
      setUndoMove(undefined);
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
      notify(t('unableRestoreClip'));
      return;
    }
    await refreshPageHighlights();
    notify(t('clipRestored'));
  };

  const undoLastMove = async () => {
    if (!undoMove) return;
    if (undoTimerRef.current !== undefined) window.clearTimeout(undoTimerRef.current);
    const restored = await restoreMovedClip(undoMove.snapshot);
    setUndoMove(undefined);
    undoTimerRef.current = undefined;
    if (!restored) {
      notify(t('unableUndoMove'));
      return;
    }
    await refresh();
    notify(t('moveUndone'));
  };

  const chooseNotebook = async (id: string) => {
    await selectNotebook(id);
    if (state.pendingCaptures.length) await assignPending(id);
  };

  const create = async (title: string) => {
    const notebook = await createNotebook(title || t('untitledNotebook'));
    if (state.pendingCaptures.length) await assignPending(notebook.id);
    setCreating(false);
  };

  const removeNotebook = async () => {
    if (!notebook || !confirm(t('deleteNotebookConfirm', notebook.title))) return;
    await deleteNotebook(notebook.id);
    await refreshPageHighlights();
  };

  const removeClip = async (clip: Clip) => {
    if (!confirm(t('deleteClipConfirm'))) return false;
    const snapshot = await deleteClip(clip.id);
    if (!snapshot) return false;
    offerUndo(snapshot, clipLabel(clip));
    await refreshPageHighlights();
    return true;
  };

  const moveClip = async (clip: Clip, targetNotebookId: string) => {
    const target = state.notebooks[targetNotebookId];
    if (!target) return;
    const snapshot = await moveClipToNotebook(clip.id, target.id);
    if (!snapshot) {
      notify(t('unableMoveClip'));
      return;
    }
    await refresh();
    offerMoveUndo(snapshot, target.title);
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

  const loadCurrentConversation = async () => {
    setConversationExportLoading(true);
    setConversationExportError('');
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (tab?.id === undefined || !isSupportedConversationUrl(tab.url)) {
      setConversationExport(undefined);
      setConversationExportTabId(undefined);
      setConversationExportError(t('openConversationFirst'));
      setConversationExportLoading(false);
      return;
    }
    const response = await sendContentMessage(tab.id, { version: 2, type: 'GET_CONVERSATION_EXPORT' }, 12).catch(() => undefined);
    if (response?.type !== 'CONVERSATION_EXPORT_RESULT' || !response.ok || !isConversationExport(response.value)) {
      setConversationExport(undefined);
      setConversationExportTabId(tab.id);
      setConversationExportError(t('unableExportConversation'));
      setConversationExportLoading(false);
      return;
    }
    setConversationExport(response.value);
    setConversationExportTabId(tab.id);
    setConversationExportStale(false);
    setConversationExportLoading(false);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    notify(t(exportSource === 'conversation' ? 'conversationMarkdownCopied' : 'markdownCopied'));
  };
  const download = async () => {
    if (exportSource === 'notebook' && !notebook) return;
    if (exportSource === 'conversation' && !conversationExport) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    try {
      const filename = exportSource === 'conversation'
        ? conversationExportFilename(conversationExport!)
        : markdownFilename(notebook!);
      await downloadTextFile(url, filename);
      notify(t(exportSource === 'conversation' ? 'conversationDownloadStarted' : 'markdownDownloadStarted'));
    } finally { window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
  };

  const openMarkdown = () => {
    setView('preview');
    if (!notebook) {
      setMarkdownSource('conversation');
      if (!conversationExport || conversationExportStale) void loadCurrentConversation();
    }
  };

  const usage = Math.min(100, bytes / 10_485_760 * 100);

  const showClipsFromConversation = useCallback(async (clipIds: string[]) => {
    const candidates = clipIds.map(id => state.clips[id]).filter((clip): clip is Clip => Boolean(clip));
    if (!candidates.length) return;
    const focus = resolveClipFocus(candidates, notebook?.id);
    if (focus.ambiguous) {
      notify(t('multipleNotebooksNotice'));
      return;
    }
    const targets = focus.clips;
    const targetNotebookId = targets[0]!.notebookId;
    if (targetNotebookId !== notebook?.id) {
      await selectNotebook(targetNotebookId);
      await refresh();
    } else if (focus.omittedOtherNotebooks) {
      notify(t('showingClipsNotice'));
    }
    setFocusedClipIds(targets.map(clip => clip.id));
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

  const showClipInMap = useCallback((clipId: string) => {
    setFocusedClipIds([clipId]);
    setNavigationMode('clips');
    setView('navigation');
  }, []);

  const clearClipMapFocus = useCallback(() => setFocusedClipIds([]), []);
  const clearConversationFocus = useCallback(() => {
    setConversationFocusClip(undefined);
    setConversationTargetTabId(undefined);
  }, []);

  return <main className={view === 'navigation' ? 'navigation-page' : undefined}>
    <header className="app-header">
      <div><div className="eyebrow">{t('localFirst')}</div><h1>{t('extName')}</h1></div>
      {!notebook && <button className="icon-button" title={t('newNotebook')} aria-label={t('newNotebook')} onClick={() => setCreating(true)}>＋</button>}
    </header>

    {state.pendingCaptures.length > 0 && <section className="pending">
      <strong>{t(state.pendingCaptures.length === 1 ? 'pendingClipsOne' : 'pendingClipsOther', String(state.pendingCaptures.length))}</strong>
      <span>{t('pendingHint')}</span>
    </section>}

    {(creating || Object.keys(state.notebooks).length === 0) && <CreateNotebook onCreate={create} canCancel={Object.keys(state.notebooks).length > 0} onCancel={() => setCreating(false)} />}

    {notebook && <NotebookEditor notebook={notebook} notebooks={notebooks} onSwitch={chooseNotebook} onCreate={() => setCreating(true)} onDelete={() => void removeNotebook()} />}
    <nav className="tabs">
      <button className={view === 'clips' ? 'active' : ''} disabled={!notebook} onClick={() => setView('clips')}>{t('clips')} {notebook && <span>{clips.length}</span>}</button>
      <button className={view === 'navigation' ? 'active' : ''} onClick={() => setView('navigation')}>{t('navigate')}</button>
      <button className={view === 'preview' ? 'active' : ''} onClick={openMarkdown}>{t('markdown')}</button>
    </nav>

    {view === 'clips' && notebook && <section className="clip-list">
        {clips.length === 0 && <EmptyState />}
        {clips.map(clip => <ClipCard key={clip.id} clip={clip} clips={clips} notebooks={notebooks} draggable onDragStart={() => setDraggedId(clip.id)} onDragOver={event => event.preventDefault()} onDrop={() => void dropOn(clip.id)} onMove={targetNotebookId => void moveClip(clip, targetNotebookId)} onDelete={() => void removeClip(clip)} onChanged={() => void refreshPageHighlights()} onShowInMap={() => showClipInMap(clip.id)} />)}
    </section>}
    <section className="navigation-workspace" hidden={view !== 'navigation'}>
      <div className="navigation-switch" role="group" aria-label={t('navigationType')}>
        <button className={navigationMode === 'conversation' ? 'active' : ''} onClick={() => setNavigationMode('conversation')}>{t('conversationMap')}</button>
        <button disabled={!notebook} className={navigationMode === 'clips' ? 'active' : ''} onClick={() => setNavigationMode('clips')}>{t('clipMap')} {notebook && <span>{clips.length}</span>}</button>
      </div>
      <div hidden={navigationMode !== 'conversation'}>
        <ConversationMap active={view === 'navigation' && navigationMode === 'conversation'} clipsById={state.clips} onShowClips={showClipsFromConversation} focusClip={conversationFocusClip} targetTabId={conversationTargetTabId} onFocusHandled={clearConversationFocus} />
      </div>
      {view === 'navigation' && navigationMode === 'clips' && (notebook ? <MindMap notebook={notebook} clips={clips} focusedClipIds={focusedClipIds} onFocusHandled={clearClipMapFocus} onShowConversation={showConversationFromClip} onDelete={removeClip} /> : <EmptyState />)}
    </section>
    {view === 'preview' && <section className="preview">
      <div className="markdown-source-switch" role="group" aria-label={t('markdownContent')}>
        <button disabled={!notebook} className={markdownSource === 'notebook' ? 'active' : ''} onClick={() => setMarkdownSource('notebook')}>{t('clipNotebook')}</button>
        <button className={markdownSource === 'conversation' ? 'active' : ''} onClick={() => {
          setMarkdownSource('conversation');
          if (!conversationExport || conversationExportStale) void loadCurrentConversation();
        }}>{t('currentConversation')}</button>
      </div>
      {markdownSource === 'notebook' && notebook && <pre>{notebookMarkdown}</pre>}
      {markdownSource === 'conversation' && <div className="conversation-export-preview">
        <div className="conversation-export-head">
          <div>
            <strong>{conversationExport?.conversationTitle ?? t('currentConversation')}</strong>
            {conversationExport && <span>{conversationExport.platform.toUpperCase()} · {t('messageOther', String(conversationExport.messages.length))}</span>}
          </div>
          <button onClick={() => void loadCurrentConversation()} disabled={conversationExportLoading}>{t(conversationExport ? 'reread' : 'readConversation')}</button>
        </div>
        {conversationExportStale && <p className="conversation-export-warning">{t('conversationTabChanged')}</p>}
        {conversationExportLoading && <div className="conversation-export-state">{t('readingFullConversation')}</div>}
        {!conversationExportLoading && conversationExportError && <div className="conversation-export-state error">{conversationExportError}</div>}
        {!conversationExportLoading && !conversationExportError && conversationExport && <>
          <p className="conversation-export-scope">{t('conversationExportScopeStatus', String(conversationExport.messages.length))}</p>
          <pre>{conversationMarkdown}</pre>
        </>}
        {!conversationExportLoading && !conversationExportError && !conversationExport && <div className="conversation-export-state">{t('readConversationHint')}</div>}
      </div>}
    </section>}

    {view !== 'navigation' && (notebook || (view === 'preview' && markdownSource === 'conversation')) && <footer className="export-bar">
        {notebook && <div className="storage" title={`${Math.round(bytes / 1024)} KB / 10 MB`}><i style={{ width: `${usage}%` }} /></div>}
        {notebook && usage >= 80 && <p className="warning">{t('storageAlmostFull')}</p>}
        <div className="export-actions"><button onClick={() => void copy()} disabled={exportSource === 'conversation' ? !conversationExport || conversationExportStale || conversationExportLoading : !clips.length}>{t(exportSource === 'conversation' ? 'copyFullConversation' : 'copyMarkdown')}</button><button className="primary" onClick={() => void download()} disabled={exportSource === 'conversation' ? !conversationExport || conversationExportStale || conversationExportLoading : !clips.length}>{t(exportSource === 'conversation' ? 'downloadFullConversation' : 'downloadMarkdown')}</button></div>
    </footer>}
    {undoDelete && <div className="notice undo-notice" role="region" aria-label={t('delete')} aria-live="polite"><span>{t('deletedClip', undoDelete.label)}</span><button autoFocus onClick={() => void undoLastDelete()}>{t('undo')}</button></div>}
    {undoMove && <div className="notice undo-notice" role="region" aria-label={t('move')} aria-live="polite"><span>{t('movedTo', undoMove.targetTitle)}</span><button onClick={() => void undoLastMove()}>{t('undo')}</button></div>}
    {!undoDelete && !undoMove && notice && <div className="notice" role="status" aria-live="polite">{notice}</div>}
  </main>;
}

function CreateNotebook({ onCreate, canCancel, onCancel }: { onCreate: (title: string) => void; canCancel: boolean; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  return <form className="create-card" onSubmit={event => { event.preventDefault(); void onCreate(title.trim()); }}>
    <strong>{t('createTopicNotebook')}</strong><p>{t('newClipsAddedHere')}</p>
    <input autoFocus value={title} maxLength={80} placeholder={t('notebookTitlePlaceholder')} onChange={event => setTitle(event.target.value)} />
    <div><button className="primary" type="submit">{t('create')}</button>{canCancel && <button type="button" onClick={onCancel}>{t('cancel')}</button>}</div>
  </form>;
}

function NotebookEditor({ notebook, notebooks, onSwitch, onCreate, onDelete }: { notebook: Notebook; notebooks: Notebook[]; onSwitch: (id: string) => Promise<void>; onCreate: () => void; onDelete: () => void }) {
  const [title, setTitle] = useState(notebook.title);
  const [description, setDescription] = useState(notebook.description);
  useEffect(() => { setTitle(notebook.title); setDescription(notebook.description); }, [notebook.id, notebook.title, notebook.description]);
  const save = () => { if (title.trim()) void updateNotebook(notebook.id, { title, description }); };
  return <section className="notebook-editor">
    <div className="notebook-heading">
      <div className="notebook-title-group">
        <input id="notebook-title" className="title-input" aria-label={t('notebookTitle')} value={title} maxLength={80} onChange={event => setTitle(event.target.value)} onBlur={save} />
        <select className="notebook-switcher" aria-label={t('switchNotebook')} title={t('switchNotebook')} value="" onChange={event => { const id = event.target.value; if (id) void onSwitch(id); }}>
          <option value=""> </option>
          {notebooks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </div>
      <div className="notebook-actions">
        <button className="notebook-action" title={t('newNotebook')} aria-label={t('newNotebook')} onClick={onCreate}>＋</button>
        <details className="notebook-menu">
          <summary title={t('notebookActions')} aria-label={t('notebookActions')}>•••</summary>
          <div className="notebook-menu-popover" role="menu">
            <button className="danger-ghost" role="menuitem" onClick={onDelete}>{t('deleteNotebook')}</button>
          </div>
        </details>
      </div>
    </div>
    <textarea value={description} maxLength={500} placeholder={t('notebookDescriptionPlaceholder')} onChange={event => setDescription(event.target.value)} onBlur={save} />
  </section>;
}

function ClipCard({ clip, clips, notebooks, onMove, onDelete, onChanged, onShowInMap, ...dragProps }: { clip: Clip; clips: Clip[]; notebooks: Notebook[]; onMove: (notebookId: string) => void; onDelete: () => void; onChanged: () => void; onShowInMap: () => void } & React.HTMLAttributes<HTMLElement>) {
  const [annotation, setAnnotation] = useState(clip.annotation);
  const [editingAnnotation, setEditingAnnotation] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const annotationEditorRef = useRef<HTMLTextAreaElement>(null);
  const annotationTriggerRef = useRef<HTMLButtonElement>(null);
  const skipAnnotationSaveRef = useRef(false);
  const parent = clip.parentClipId ? clips.find(item => item.id === clip.parentClipId) : undefined;
  useEffect(() => setAnnotation(clip.annotation), [clip.annotation]);
  useEffect(() => { if (editingAnnotation) annotationEditorRef.current?.focus(); }, [editingAnnotation]);
  const openSource = () => openClipSource(clip);
  const saveAnnotation = () => {
    if (skipAnnotationSaveRef.current) return;
    setEditingAnnotation(false);
    void updateClip(clip.id, { annotation });
  };
  const cancelAnnotationEdit = () => {
    skipAnnotationSaveRef.current = true;
    setAnnotation(clip.annotation);
    setEditingAnnotation(false);
    window.requestAnimationFrame(() => {
      skipAnnotationSaveRef.current = false;
      annotationTriggerRef.current?.focus();
    });
  };
  const activateCard = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('button, textarea, input, select, a, [contenteditable="true"]')) return;
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
    if ('key' in event) event.preventDefault();
    void openSource();
  };
  return <article ref={cardRef} id={`clip-${clip.id}`} className="clip-card" role="button" tabIndex={0} title={t('openSourceMessage')} onClick={activateCard} onKeyDown={activateCard} {...dragProps}>
    <div className="clip-meta"><span className={`platform ${clip.platform}`}>{clip.platform}</span><span>{roleLabel(clip.messageRole)}</span><span>{formatDate(clip.capturedAt)}</span><span className={clip.anchor.status === 'unresolved' ? 'unresolved' : 'resolved'}>{clip.anchor.status === 'unresolved' ? t('sourceNotFound') : t('sourceFound')}</span><span className="drag" aria-hidden="true">⠿</span></div>
    <blockquote>{clip.originalText}</blockquote>
    {editingAnnotation
      ? <textarea ref={annotationEditorRef} className="annotation-editor" value={annotation} maxLength={2000} placeholder={t('annotationPlaceholder')} aria-label={t('yourAnnotation')} onChange={event => setAnnotation(event.target.value)} onBlur={saveAnnotation} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelAnnotationEdit(); } }} />
      : annotation.trim()
        ? <button ref={annotationTriggerRef} type="button" className="annotation-preview" aria-label={`${t('editAnnotation')}: ${annotation}`} onClick={() => setEditingAnnotation(true)}><span>{t('myAnnotation')}</span><strong>{annotation}</strong></button>
        : <button ref={annotationTriggerRef} type="button" className="annotation-add" onClick={() => setEditingAnnotation(true)}>＋ {t('addAnnotation')}</button>}
    {parent && <button type="button" className="connection-status" title={t('clipMap')} onClick={onShowInMap}><span>{t('under')}</span><strong>{clipLabel(parent, 38)}</strong><i aria-hidden="true">→</i></button>}
    <div className="card-actions"><div className="colors">{COLORS.map(color => <button key={color} aria-label={t('highlightColor', colorLabel(color))} className={clip.highlightColor === color ? 'selected' : ''} data-color={color} onClick={() => { void updateClip(clip.id, { highlightColor: color }).then(onChanged); }} />)}</div>{notebooks.length > 1 && <MoveClipMenu clip={clip} clips={clips} notebooks={notebooks} onMove={onMove} />}<button onClick={() => void openSource()}>{t('source')}</button><button className="danger-ghost" onClick={onDelete}>{t('remove')}</button></div>
  </article>;
}

function MoveClipMenu({ clip, clips, notebooks, onMove }: { clip: Clip; clips: Clip[]; notebooks: Notebook[]; onMove: (notebookId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const targets = notebooks.filter(item => item.id !== clip.notebookId);
  const filteredTargets = targets.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const hasConnections = Boolean(clip.parentClipId) || clips.some(item => item.parentClipId === clip.id);
  const menuId = `move-menu-${clip.id}`;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const chooseTarget = (notebookId: string) => {
    setOpen(false);
    setQuery('');
    onMove(notebookId);
  };

  return <div className="move-menu" ref={rootRef}>
    <button ref={buttonRef} type="button" className="move-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => { setQuery(''); setOpen(value => !value); }}>{t('move')}</button>
    {open && <div className="move-popover" id={menuId} role="menu" aria-label={t('moveClipTo')}>
      <div className="move-popover-header"><strong>{t('moveClipTo')}</strong><span>{targets.length === 1 ? t('notebookOne', String(targets.length)) : t('notebookOther', String(targets.length))}</span></div>
      {targets.length > 6 && <input autoFocus type="search" value={query} placeholder={t('findNotebook')} aria-label={t('findNotebookLabel')} onChange={event => setQuery(event.target.value)} />}
      <div className="move-targets">
        {filteredTargets.map((item, index) => <button autoFocus={targets.length <= 6 && index === 0} type="button" role="menuitem" key={item.id} onClick={() => chooseTarget(item.id)}><span>{item.title}</span><small>{item.clipIds.length}</small></button>)}
        {!filteredTargets.length && <p>{t('noMatchingNotebooks')}</p>}
      </div>
      {hasConnections && <p className="move-warning">{t('moveWarning')}</p>}
    </div>}
  </div>;
}

type MapNodeData = { label: React.ReactNode; color: string; clip?: Clip };
type MapNode = Node<MapNodeData>;

function MindMap({ notebook, clips, focusedClipIds, onFocusHandled, onShowConversation, onDelete }: { notebook: Notebook; clips: Clip[]; focusedClipIds: string[]; onFocusHandled: () => void; onShowConversation: (clip: Clip) => void; onDelete: (clip: Clip) => Promise<boolean> }) {
  const [selectedClipId, setSelectedClipId] = useState(focusedClipIds.length === 1 ? focusedClipIds[0] : undefined);
  const [highlightedClipIds, setHighlightedClipIds] = useState(focusedClipIds);
  const [detailOpen, setDetailOpen] = useState(focusedClipIds.length === 1);
  const createGraph = useCallback((preferSavedPositions = true) => {
    const layout = layoutMindMap(notebook, clips);
    const positions = preferSavedPositions ? { ...layout.positions, ...notebook.mindMapPositions } : layout.positions;
    const graphNodes: MapNode[] = [
      {
        id: MIND_MAP_ROOT_ID,
        type: 'input',
        position: positions[MIND_MAP_ROOT_ID]!,
        data: { color: 'root', label: <><strong>{notebook.title}</strong><small>{clips.length === 1 ? t('clipCountOne', String(clips.length)) : t('clipCountOther', String(clips.length))}</small></> },
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
        className: `flow-node flow-clip color-${clip.highlightColor}${clip.id === selectedClipId || highlightedClipIds.includes(clip.id) ? ' flow-focus' : ''}`
      }))
    ];
    const graphEdges: Edge[] = layout.edges.map(edge => ({
      ...edge,
      type: 'smoothstep',
      deletable: false,
      style: { strokeWidth: 1.8 }
    }));
    return { graphNodes, graphEdges };
  }, [notebook, clips, highlightedClipIds, selectedClipId]);

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
    if (!focusedClipIds.length) return;
    const requestedIds = focusedClipIds.filter(id => clips.some(clip => clip.id === id));
    const targets = nodes.filter(node => requestedIds.includes(node.id));
    if (!requestedIds.length || !instance || targets.length !== requestedIds.length) return;
    const singleId = requestedIds.length === 1 ? requestedIds[0] : undefined;
    setHighlightedClipIds(requestedIds);
    setSelectedClipId(singleId);
    setDetailOpen(Boolean(singleId));
    window.setTimeout(() => void instance.fitView({ nodes: targets, padding: 1.1, maxZoom: 1.15, duration: 300 }), 20);
    onFocusHandled();
  }, [clips, focusedClipIds, instance, nodes, onFocusHandled]);

  useEffect(() => {
    if (selectedClipId && !clips.some(clip => clip.id === selectedClipId)) {
      setSelectedClipId(undefined);
      setDetailOpen(false);
    }
    setHighlightedClipIds(current => current.filter(id => clips.some(clip => clip.id === id)));
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
  return <section className="mind-map" aria-label={t('clipMindMap')} onKeyDown={handleMapKeyDown}>
    <header className="navigation-view-head">
      <div><h2>{notebook.title}</h2><p>{t(clips.length === 1 ? 'clipCountOne' : 'clipCountOther', String(clips.length))} · {t('freeformCanvas')}</p></div>
    </header>
    <div className="map-toolbar">
      <button disabled={!selectedClipId} title={t('openSourceMessage')} onClick={() => { const clip = clips.find(item => item.id === selectedClipId); if (clip) onShowConversation(clip); }}>{t('inConversation')}</button>
      <button className="map-delete" disabled={!selectedClipId} title={t('deleteSelectedClip')} onClick={() => void removeSelected()}>{t('delete')}</button>
      <button onClick={arrange}>{t('autoArrange')}</button>
      <button onClick={() => void instance?.fitView({ padding: .22, duration: 350 })}>{t('fitView')}</button>
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
          setHighlightedClipIds(node.data.clip ? [node.data.clip.id] : []);
          setSelectedClipId(node.data.clip?.id);
          setDetailOpen(Boolean(node.data.clip));
        }}
        onPaneClick={() => { setHighlightedClipIds([]); setSelectedClipId(undefined); setDetailOpen(false); }}
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
      <aside className={`map-detail${detailOpen && selectedClip ? ' open' : ''}`} aria-hidden={!detailOpen || !selectedClip} aria-label={t('fullClip')} inert={!detailOpen || !selectedClip}>
        {selectedClip && <MindMapDetail clip={selectedClip} clips={clips} onClose={() => setDetailOpen(false)} onShowConversation={() => onShowConversation(selectedClip)} />}
      </aside>
    </div>
    <p className="map-help">{t('dragNodes')} · {t('clipMapHelp')}</p>
  </section>;
}

function MindMapDetail({ clip, clips, onClose, onShowConversation }: { clip: Clip; clips: Clip[]; onClose: () => void; onShowConversation: () => void }) {
  const [annotation, setAnnotation] = useState(clip.annotation);
  const parent = clip.parentClipId ? clips.find(item => item.id === clip.parentClipId) : undefined;
  useEffect(() => setAnnotation(clip.annotation), [clip.id, clip.annotation]);
  return <div className="map-detail-content">
    <header>
      <div><span className={`platform ${clip.platform}`}>{clip.platform}</span><strong>{t('fullClip')}</strong></div>
      <button className="map-detail-close" aria-label={t('closeFullClip')} title={t('closeEscape')} onClick={onClose}>×</button>
    </header>
    <div className="map-detail-meta"><span>{roleLabel(clip.messageRole)}</span><span>{formatDate(clip.capturedAt)}</span></div>
    <section className="map-detail-original" aria-labelledby={`full-clip-${clip.id}`}>
      <div><strong id={`full-clip-${clip.id}`}>{t('originalExcerpt')}</strong><span>{t('readOnly')}</span></div>
      <blockquote>{clip.originalText}</blockquote>
    </section>
    <label className="map-detail-annotation"><span>{t('yourAnnotation')}</span><textarea value={annotation} maxLength={2000} placeholder={t('annotationPlaceholder')} onChange={event => setAnnotation(event.target.value)} onBlur={() => void updateClip(clip.id, { annotation })} /></label>
    <details className="map-detail-connection">
      <summary><strong>{t('connection')}</strong><span>{parent ? clipLabel(parent, 28) : t('notebookTopicRoot')}</span></summary>
      <label><span>{t('changeParent')}</span><select value={clip.parentClipId ?? ''} onChange={event => void setClipParent(clip.id, event.target.value || undefined)}><option value="">{t('notebookTopicRoot')}</option>{validParentOptions(clip, clips).map(item => <option key={item.id} value={item.id}>{clipLabel(item)}</option>)}</select></label>
      {clip.parentClipId && <button type="button" onClick={() => void setClipParent(clip.id, undefined)}>{t('moveToNotebookRoot')}</button>}
    </details>
    <footer><button onClick={() => void openClipSource(clip)}>{t('source')}</button><button className="primary" title={t('openSourceMessage')} onClick={onShowConversation}>{t('inConversation')}</button></footer>
  </div>;
}

function mapNodeColor(color: string): string {
  return ({ yellow: '#c36a3d', green: '#5c7c68', blue: '#667b9d', pink: '#b87378' } as Record<string, string>)[color] ?? '#8b8479';
}

function clipLabel(clip: Clip, maxLength = 48): string {
  const text = clip.originalText.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function roleLabel(role: Clip['messageRole']): string {
  return role === 'assistant' ? t('roleAi') : role === 'user' ? t('roleYou') : t('unknownRole');
}

function colorLabel(color: HighlightColor): string {
  return t(`color${color[0]!.toUpperCase()}${color.slice(1)}`);
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
  return <div className="empty"><div>✦</div><strong>{t('noClipsYet')}</strong><p>{t('emptyStateBody')}</p><kbd>⌃⇧S</kbd></div>;
}

async function refreshPageHighlights(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter(tab => tab.id !== undefined && /chatgpt\.com|claude\.ai|gemini\.google\.com/.test(tab.url ?? '')).map(tab => chrome.tabs.sendMessage(tab.id!, { version: 1, type: 'REFRESH_HIGHLIGHTS' } satisfies ExtensionMessage).catch(() => undefined)));
}
