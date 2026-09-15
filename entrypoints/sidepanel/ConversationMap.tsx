import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  conversationNodeLocator, findConversationNodeForClip, isConversationGraphSnapshot,
  type ConversationGraphNode, type ConversationGraphSnapshot
} from '../../lib/conversation-graph';
import { buildConversationTurns, conversationPreview, defaultTurnMessage, filterConversationTurns } from '../../lib/conversation-navigation';
import type { ExtensionMessage } from '../../lib/messages';
import { isSameConversationUrl, isSupportedConversationUrl } from '../../lib/conversation-url';
import type { Clip } from '../../lib/models';
import { sendContentMessage } from '../../lib/tab-content';
import { t } from '../../lib/i18n';

interface ConversationMapProps {
  active?: boolean;
  clipsById?: Record<string, Clip>;
  onShowClips: (clipIds: string[]) => void;
  focusClip?: Clip;
  targetTabId?: number;
  onFocusHandled: () => void;
}

const NO_CLIPS: Record<string, Clip> = {};

export function ConversationMap({ active = true, clipsById = NO_CLIPS, onShowClips, focusClip, targetTabId, onFocusHandled }: ConversationMapProps) {
  const [snapshot, setSnapshot] = useState<ConversationGraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyClipped, setOnlyClipped] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [followPage, setFollowPage] = useState(true);
  const [inlineError, setInlineError] = useState('');
  const [locatingNodeId, setLocatingNodeId] = useState<string>();
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [showSourceText, setShowSourceText] = useState(false);
  const tabIdRef = useRef<number | null>(null);
  const conversationUrlRef = useRef('');
  const requestIdRef = useRef(0);
  const locateRequestRef = useRef(0);
  const sourceKeyRef = useRef('');
  const directoryRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const refresh = useCallback(async (requestedTabId?: number) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    setInlineError('');
    try {
      const tab = requestedTabId !== undefined
        ? await chrome.tabs.get(requestedTabId)
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (requestId !== requestIdRef.current) return;
      const previousTabId = tabIdRef.current;
      if (previousTabId !== null && previousTabId !== tab?.id) {
        void chrome.tabs.sendMessage(previousTabId, { version: 2, type: 'STOP_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
      }
      tabIdRef.current = tab?.id ?? null;
      if (tab?.id === undefined || !isSupportedConversationUrl(tab.url)) {
        conversationUrlRef.current = '';
        setSnapshot(null);
        setError(t('openConversationFirst'));
        return;
      }
      if (previousTabId !== tab.id || !isSameConversationUrl(tab.url!, conversationUrlRef.current)) {
        conversationUrlRef.current = '';
        setSnapshot(null);
      }
      await sendContentMessage(tab.id, { version: 2, type: 'START_CONVERSATION_GRAPH' }, 12);
      let response: ExtensionMessage | undefined;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (requestId !== requestIdRef.current) return;
        response = await sendContentMessage(tab.id, { version: 2, type: 'GET_CONVERSATION_GRAPH' }, 2);
        if (response?.type === 'CONVERSATION_GRAPH_RESULT' && response.ok && isConversationGraphSnapshot(response.snapshot)) break;
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
      if (requestId !== requestIdRef.current) return;
      if (response?.type !== 'CONVERSATION_GRAPH_RESULT' || !response.ok || !isConversationGraphSnapshot(response.snapshot)) throw new Error('invalid response');
      conversationUrlRef.current = response.snapshot.conversationUrl;
      setSnapshot(response.snapshot);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setSnapshot(null);
      setError(t('unableReadConversation'));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    setLocatingNodeId(undefined);
    void refresh(targetTabId);
    const activated = ({ tabId }: { tabId: number }) => {
      if (tabId !== tabIdRef.current) void refresh(tabId);
    };
    const updated = (tabId: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (tabId === tabIdRef.current && (change.status === 'complete' || change.url)) void refresh(tabId);
    };
    const message = (value: ExtensionMessage, sender: chrome.runtime.MessageSender) => {
      if (sender.tab?.id !== tabIdRef.current || value?.version !== 2) return;
      if (value.type === 'CONVERSATION_GRAPH_UPDATED' && isConversationGraphSnapshot(value.snapshot) && value.snapshot.conversationUrl === conversationUrlRef.current) {
        setSnapshot(value.snapshot);
        setLoading(false);
      }
      if (value.type === 'CONVERSATION_GRAPH_CLEARED') {
        locateRequestRef.current += 1;
        setLocatingNodeId(undefined);
        conversationUrlRef.current = value.conversationUrl;
        setSnapshot(null);
        setLoading(true);
      }
      if (value.type === 'CONVERSATION_ACTIVE_NODE' && value.conversationUrl === conversationUrlRef.current) {
        setSnapshot(current => current ? { ...current, activeNodeId: value.nodeId } : current);
      }
    };
    const heartbeat = window.setInterval(() => {
      if (tabIdRef.current !== null) void chrome.tabs.sendMessage(tabIdRef.current, { version: 2, type: 'START_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
    }, 45_000);
    chrome.tabs.onActivated.addListener(activated);
    chrome.tabs.onUpdated.addListener(updated);
    chrome.runtime.onMessage.addListener(message);
    return () => {
      chrome.tabs.onActivated.removeListener(activated);
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.runtime.onMessage.removeListener(message);
      window.clearInterval(heartbeat);
      requestIdRef.current += 1;
      locateRequestRef.current += 1;
      if (tabIdRef.current !== null) void chrome.tabs.sendMessage(tabIdRef.current, { version: 2, type: 'STOP_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
    };
  }, [active, refresh, targetTabId]);

  const turns = useMemo(() => buildConversationTurns(snapshot?.nodes ?? []), [snapshot?.nodes]);
  const visibleTurns = useMemo(() => filterConversationTurns(turns, onlyClipped, query), [turns, onlyClipped, query]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => normalizedQuery ? visibleTurns.flatMap(turn => turn.messages)
    .filter(message => message.searchText.toLocaleLowerCase().includes(normalizedQuery)) : [], [normalizedQuery, visibleTurns]);
  const currentTurn = turns.find(turn => turn.messages.some(message => message.id === snapshot?.activeNodeId));
  const selectedTurn = visibleTurns.find(turn => turn.messages.some(message => message.id === selectedNodeId)) ??
    visibleTurns.find(turn => turn.id === currentTurn?.id) ?? visibleTurns[0];
  const selectedMessage = selectedTurn?.messages.find(message => message.id === selectedNodeId) ?? (selectedTurn ? defaultTurnMessage(selectedTurn) : undefined);
  const selectedClips = selectedTurn?.clipIds.flatMap(id => clipsById[id] ? [clipsById[id]!] : []) ?? [];
  const matchIndex = matches.findIndex(message => message.id === selectedMessage?.id);
  const previewText = selectedMessage?.searchText || selectedMessage?.text || '';
  const canExpandPreview = previewText.length > 160 || previewText.split('\n').length > 3;
  const outline = selectedMessage?.outline;
  const hasOutline = Boolean(outline?.items.length);
  const outlineBaseLevel = Math.min(...(outline?.items.filter(item => item.kind === 'heading').map(item => item.level) ?? []), 6);

  useEffect(() => { setExpandedPreview(false); setShowSourceText(false); }, [selectedMessage?.id]);

  useEffect(() => {
    if (!snapshot || !turns.length) return;
    const key = `${tabIdRef.current}:${snapshot.conversationUrl}`;
    if (key === sourceKeyRef.current) return;
    sourceKeyRef.current = key;
    setQuery('');
    setOnlyClipped(false);
    setSelectedNodeId(snapshot.activeNodeId ?? defaultTurnMessage(turns[0]!).id);
    setFollowPage(true);
    setLocatingNodeId(undefined);
    if (directoryRef.current) directoryRef.current.scrollTop = 0;
  }, [snapshot, turns]);

  const revealTurn = useCallback((turnId: string) => {
    const container = directoryRef.current;
    const row = rowRefs.current.get(turnId);
    if (!container || !row) return;
    const bounds = container.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    if (rowBounds.top < bounds.top) container.scrollTop += rowBounds.top - bounds.top;
    else if (rowBounds.bottom > bounds.bottom) container.scrollTop += rowBounds.bottom - bounds.bottom;
  }, []);

  useEffect(() => {
    if (active && followPage && !query && !onlyClipped && currentTurn) revealTurn(currentTurn.id);
  }, [active, followPage, currentTurn?.id, query, onlyClipped, revealTurn]);

  useEffect(() => {
    if (!active || !focusClip || !snapshot) return;
    const sameConversation = focusClip.platform === snapshot.platform && (
      Boolean(focusClip.conversationId && focusClip.conversationId === snapshot.conversationId) ||
      isSameConversationUrl(focusClip.conversationUrl, snapshot.conversationUrl));
    if (!sameConversation) return;
    const target = findConversationNodeForClip(snapshot.nodes, focusClip);
    if (!target) return;
    setQuery('');
    setOnlyClipped(false);
    setFollowPage(false);
    setSelectedNodeId(target.id);
    onFocusHandled();
  }, [active, focusClip, onFocusHandled, snapshot]);

  useEffect(() => {
    if (active && selectedTurn) revealTurn(selectedTurn.id);
  }, [active, selectedTurn?.id, revealTurn]);

  const selectMessage = (message: ConversationGraphNode) => {
    setSelectedNodeId(message.id);
    setFollowPage(false);
    setInlineError('');
  };

  const moveMatch = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next = matchIndex < 0 ? (direction === 1 ? 0 : matches.length - 1) : (matchIndex + direction + matches.length) % matches.length;
    selectMessage(matches[next]!);
  };

  const returnToSource = () => {
    setQuery('');
    setOnlyClipped(false);
    setSelectedNodeId(snapshot?.activeNodeId);
    setFollowPage(true);
  };

  const openMessage = async (message: ConversationGraphNode) => {
    const tabId = tabIdRef.current;
    if (tabId === null || !snapshot) return;
    const url = snapshot.conversationUrl;
    const request = ++locateRequestRef.current;
    setLocatingNodeId(message.id);
    setInlineError('');
    setFollowPage(false);
    try {
      await chrome.tabs.update(tabId, { active: true });
      const response = await sendContentMessage(tabId, {
        version: 2, type: 'SCROLL_TO_CONVERSATION_NODE', nodeId: message.id,
        conversationUrl: url, locator: conversationNodeLocator(message)
      }, 12);
      if (request !== locateRequestRef.current || tabId !== tabIdRef.current || url !== conversationUrlRef.current) return;
      if (response?.type !== 'SCROLL_TO_CONVERSATION_NODE_RESULT' || !response.ok) throw new Error('source unavailable');
      setSnapshot(current => current?.conversationUrl === url ? { ...current, activeNodeId: message.id } : current);
    } catch {
      if (request === locateRequestRef.current && url === conversationUrlRef.current) setInlineError(t('messageChanged'));
    } finally {
      if (request === locateRequestRef.current) setLocatingNodeId(undefined);
    }
  };

  if (loading && !snapshot) return <ConversationState title={t('readingConversation')} />;
  if (error && !snapshot) return <ConversationState title={error} action={t('tryAgain')} onAction={() => void refresh()} />;
  if (!snapshot || !turns.length) return <ConversationState title={t('noMessages')} action={t('tryAgain')} onAction={() => void refresh()} />;

  return <section className="conversation-map" aria-label={t('currentConversationMap')}>
    <header className="conversation-map-head navigation-view-head">
      <div><h2>{snapshot.conversationTitle}</h2><p><span>{t('conversationTurnCount', String(turns.length))}</span><span>{t('messageOther', String(snapshot.nodes.length))}</span></p></div>
      <details className="conversation-options"><summary>{t('conversationOptions')}</summary><div>
        <label><input type="checkbox" checked={onlyClipped} onChange={event => { setOnlyClipped(event.target.checked); setFollowPage(false); }} />{t('turnsWithClips')}</label>
        <button disabled={loading} onClick={() => void refresh()}>{t('refresh')}</button>
        <button disabled={!snapshot.activeNodeId} onClick={returnToSource}>{t('backToSourcePosition')}</button>
      </div></details>
    </header>
    <div className="conversation-search">
      <input type="search" value={query} placeholder={t('searchQuestionsAnswers')} aria-label={t('searchQuestionsAnswers')} onChange={event => {
        const value = event.target.value;
        setQuery(value);
        setFollowPage(false);
        const search = value.trim().toLocaleLowerCase();
        const first = turns.filter(turn => !onlyClipped || turn.clipIds.length).flatMap(turn => turn.messages)
          .find(message => search && message.searchText.toLocaleLowerCase().includes(search));
        if (first) setSelectedNodeId(first.id);
      }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1); } }} />
      <label className="conversation-follow"><input type="checkbox" checked={followPage} onChange={() => followPage ? setFollowPage(false) : returnToSource()} />{t('followOriginal')}</label>
    </div>
    {onlyClipped && <p className="conversation-filter-status">{t('turnsWithClips')}<button onClick={() => setOnlyClipped(false)}>{t('clearConversationFilters')}</button></p>}
    {normalizedQuery && <div className="conversation-search-results" role="status">
      <span>{t('searchMatchCount', [String(matchIndex + 1), String(matches.length)])}</span>
      <button disabled={!matches.length} onClick={() => moveMatch(-1)}>{t('previousMatch')}</button>
      <button disabled={!matches.length} onClick={() => moveMatch(1)}>{t('nextMatch')}</button>
    </div>}
    <div className="conversation-directory" ref={directoryRef} onWheel={() => setFollowPage(false)} onTouchMove={() => setFollowPage(false)}>
      <ol aria-label={t('conversationDirectory')}>
        {visibleTurns.map((turn, index) => {
          const selected = turn.id === selectedTurn?.id;
          const atSource = turn.id === currentTurn?.id;
          const omitted = turn.number - (visibleTurns[index - 1]?.number ?? 0) - 1;
          return <li key={turn.id}>
            {omitted > 0 && <p className="conversation-omitted">{t('omittedTurns', String(omitted))}</p>}
            <button className={`conversation-turn${selected ? ' is-selected' : ''}${atSource ? ' at-source' : ''}`}
              ref={element => { if (element) rowRefs.current.set(turn.id, element); else rowRefs.current.delete(turn.id); }}
              aria-pressed={selected} aria-current={atSource ? 'location' : undefined}
              onKeyDown={event => {
                const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
                if (!offset) return;
                event.preventDefault();
                const next = visibleTurns[index + offset];
                if (next) { selectMessage(defaultTurnMessage(next)); rowRefs.current.get(next.id)?.focus(); }
              }}
              onClick={() => selectMessage(defaultTurnMessage(turn))}>
              <span className="conversation-turn-number">{String(turn.number).padStart(2, '0')}</span>
              <span className="conversation-turn-copy">
                <strong title={turn.question ? conversationPreview(turn.question) : turn.messages[0]!.title}>{turn.question ? conversationPreview(turn.question) : t(turn.answer ? 'standaloneAnswer' : 'roleContent')}</strong>
                <span className="conversation-turn-preview">{turn.answer ? conversationPreview(turn.answer) : turn.question ? t('noAnswerYet') : conversationPreview(turn.messages[0]!)}</span>
                <span className="conversation-turn-markers">
                  {turn.clipIds.length > 0 && <span>{t('turnClipBadge', String(turn.clipIds.length))}</span>}
                  {selected && <span className="preview-marker">{t('previewing')}</span>}
                  {atSource && <span className="source-marker">{t('sourcePosition')}</span>}
                  {turn.messages.some(message => message.branch) && <span>{t('hasAnswerVersions')}</span>}
                </span>
              </span>
            </button>
          </li>;
        })}
      </ol>
      {!visibleTurns.length && <div className="conversation-no-results"><p>{t('noMatchingTurns')}</p><button onClick={() => { setQuery(''); setOnlyClipped(false); }}>{t('clearConversationFilters')}</button></div>}
    </div>
    {selectedTurn && selectedMessage && <section className="conversation-detail" aria-label={t('turnDetails')}>
      <header><span className="conversation-detail-round">{t('conversationRound', String(selectedTurn.number).padStart(2, '0'))}</span>
        <h3>{selectedTurn.question ? conversationPreview(selectedTurn.question) : selectedMessage.title}</h3></header>
      <div className="conversation-message-switch" role="group" aria-label={t('previewMessage')}>
        {selectedTurn.messages.map(message => <button key={message.id} aria-pressed={message.id === selectedMessage.id} onClick={() => selectMessage(message)}>{t(message.role === 'user' ? 'question' : message.role === 'assistant' ? 'answer' : 'roleContent')}</button>)}
      </div>
      <div className="conversation-preview-heading"><h4>{t('sourcePreview')}</h4>
        {hasOutline ? <button className="conversation-preview-toggle" aria-pressed={showSourceText} onClick={() => setShowSourceText(value => !value)}>{t(showSourceText ? 'viewSourceOutline' : 'viewSourceText')}</button>
          : canExpandPreview && <button aria-expanded={expandedPreview} onClick={() => setExpandedPreview(value => !value)}>{t(expandedPreview ? 'collapseSourcePreview' : 'expandSourcePreview')}</button>}
        {selectedMessage.branch && <span>{t('answerVersion', [String(selectedMessage.branch.index), String(selectedMessage.branch.count)])}</span>}
        {selectedMessage.isReport && <span>{t('report')}</span>}
      </div>
      {hasOutline && !showSourceText ? <div className="conversation-outline" tabIndex={0} aria-label={t('sourceOutline')}>
        <ol>{outline!.items.map((item, index) => <li key={index} data-kind={item.kind}
          style={{ paddingInlineStart: `${Math.max(0, Math.min(3, item.level - outlineBaseLevel)) * 12}px` }}>
          <strong>{item.text}</strong>
        </li>)}</ol>
        {outline!.truncated && <p className="conversation-outline-note">{t('sourceOutlineTruncated')}</p>}
      </div> : <p className={`conversation-detail-text${expandedPreview || hasOutline ? ' expanded' : ''}`} tabIndex={0} aria-label={t('sourcePreview')}>{previewText || t('emptyMessage')}</p>}
      <section className="conversation-turn-clips" aria-label={t('turnClips', String(selectedClips.length))}>
        <h4>{t('turnClips', String(selectedClips.length))}</h4>
        {selectedClips.length ? <ul>{selectedClips.map(clip => <li key={clip.id}>
          <button onClick={() => onShowClips([clip.id])} aria-label={t('viewThisClip', clip.originalText)}>
            <blockquote>{clip.originalText}</blockquote>
          </button>
        </li>)}</ul> : <p className="conversation-no-clips">{t('noTurnClips')}</p>}
      </section>
      {inlineError && <p className="conversation-inline-error" role="alert">{inlineError}</p>}
      <div className="conversation-detail-actions">
        <button className="conversation-locate" disabled={Boolean(locatingNodeId)} onClick={() => void openMessage(selectedMessage)}>{t(locatingNodeId ? 'locatingOriginal' : selectedMessage.role === 'user' ? 'locateQuestion' : selectedMessage.role === 'assistant' ? 'locateAnswer' : 'locateMessage')}</button>
        <button disabled={!selectedClips.length} onClick={() => onShowClips(selectedClips.map(clip => clip.id))}>{t('viewInClipMap')}</button>
      </div>
    </section>}
    <p className="conversation-scope">{t('conversationDirectoryHelp')}</p>
  </section>;
}

function ConversationState({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="conversation-state" role="status"><strong>{title}</strong>{action && <button onClick={onAction}>{action}</button>}</div>;
}
