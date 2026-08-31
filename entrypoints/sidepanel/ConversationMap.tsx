import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position,
  ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance
} from '@xyflow/react';
import {
  conversationNodeLocator, findConversationNodeForClip, isConversationGraphSnapshot,
  type ConversationGraphNode,
  type ConversationGraphSnapshot
} from '../../lib/conversation-graph';
import type { ExtensionMessage } from '../../lib/messages';
import { isSameConversationUrl, isSupportedConversationUrl } from '../../lib/conversation-url';
import type { Clip } from '../../lib/models';
import { sendContentMessage } from '../../lib/tab-content';

interface ConversationNodeData extends Record<string, unknown> {
  message: ConversationGraphNode;
  active: boolean;
  matched: boolean;
  dimmed: boolean;
  onShowClips: (clipIds: string[]) => void;
}

type ConversationFlowNode = Node<ConversationNodeData, 'conversation'>;

const nodeTypes = { conversation: ConversationNodeCard };

interface ConversationMapProps {
  onShowClips: (clipIds: string[]) => void;
  focusClip?: Clip;
  targetTabId?: number;
  onFocusHandled: () => void;
}

export function ConversationMap({ onShowClips, focusClip, targetTabId, onFocusHandled }: ConversationMapProps) {
  const [snapshot, setSnapshot] = useState<ConversationGraphSnapshot | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyClipped, setOnlyClipped] = useState(false);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [followPage, setFollowPage] = useState(true);
  const [inlineError, setInlineError] = useState('');
  const [instance, setInstance] = useState<ReactFlowInstance<ConversationFlowNode, Edge> | null>(null);
  const tabIdRef = useRef<number | null>(null);
  const conversationUrlRef = useRef('');
  const requestIdRef = useRef(0);
  const flowNodesRef = useRef<ConversationFlowNode[]>([]);

  const refresh = useCallback(async (requestedTabId?: number) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    setInlineError('');
    const tab = requestedTabId !== undefined
      ? await chrome.tabs.get(requestedTabId).catch(() => undefined)
      : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (requestId !== requestIdRef.current) return;
    if (tab?.id === undefined || !isSupportedConversationUrl(tab.url)) {
      setTabId(tab?.id ?? null);
      tabIdRef.current = tab?.id ?? null;
      conversationUrlRef.current = '';
      setSnapshot(null);
      setError('Open a ChatGPT, Claude, or Gemini conversation first');
      setLoading(false);
      return;
    }
    const previousTabId = tabIdRef.current;
    if (previousTabId !== null && previousTabId !== tab.id) {
      void chrome.tabs.sendMessage(previousTabId, { version: 2, type: 'STOP_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
    }
    setTabId(tab.id);
    tabIdRef.current = tab.id;
    try {
      await sendContentMessage(tab.id, { version: 2, type: 'START_CONVERSATION_GRAPH' }, 12);
      let response: ExtensionMessage | undefined;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        response = await sendContentMessage(tab.id, { version: 2, type: 'GET_CONVERSATION_GRAPH' }, 2);
        if (response?.type === 'CONVERSATION_GRAPH_RESULT' && response.ok && isConversationGraphSnapshot(response.snapshot)) break;
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
      if (requestId !== requestIdRef.current || tabIdRef.current !== tab.id) return;
      if (response?.type !== 'CONVERSATION_GRAPH_RESULT' || !response.ok || !isConversationGraphSnapshot(response.snapshot)) {
        throw new Error(response?.type === 'CONVERSATION_GRAPH_RESULT' ? response.error : 'invalid response');
      }
      conversationUrlRef.current = response.snapshot.conversationUrl;
      setSnapshot(response.snapshot);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setSnapshot(null);
      setError('Unable to read this conversation yet. Wait for the page to finish loading, then try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const activated = () => void refresh();
    const updated = (updatedTabId: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (updatedTabId === tabIdRef.current && (change.status === 'complete' || change.url)) void refresh(updatedTabId);
    };
    const message = (value: ExtensionMessage, sender: chrome.runtime.MessageSender) => {
      if (sender.tab?.id !== tabIdRef.current || value?.version !== 2) return;
      if (value.type === 'CONVERSATION_GRAPH_UPDATED' && isConversationGraphSnapshot(value.snapshot) && value.snapshot.conversationUrl === conversationUrlRef.current) {
        setSnapshot(value.snapshot);
        setLoading(false);
      }
      if (value.type === 'CONVERSATION_GRAPH_CLEARED') {
        conversationUrlRef.current = value.conversationUrl;
        setSnapshot(null);
        setLoading(true);
      }
      if (value.type === 'CONVERSATION_ACTIVE_NODE' && value.conversationUrl === conversationUrlRef.current) {
        setSnapshot(current => current ? { ...current, activeNodeId: value.nodeId } : current);
      }
    };
    const heartbeat = window.setInterval(() => {
      const currentTabId = tabIdRef.current;
      if (currentTabId !== null) void chrome.tabs.sendMessage(currentTabId, { version: 2, type: 'START_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
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
      const currentTabId = tabIdRef.current;
      if (currentTabId !== null) void chrome.tabs.sendMessage(currentTabId, { version: 2, type: 'STOP_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
    };
  }, [refresh]);

  useEffect(() => {
    if (targetTabId !== undefined) void refresh(targetTabId);
  }, [refresh, targetTabId]);

  const visibleMessages = useMemo(() => {
    if (!snapshot) return [];
    return onlyClipped ? snapshot.nodes.filter(node => node.clipIds.length > 0) : snapshot.nodes;
  }, [onlyClipped, snapshot]);
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const matches = useMemo(() => normalizedQuery
    ? visibleMessages.filter(node => node.searchText.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    : [], [normalizedQuery, visibleMessages]);

  const flow = useMemo(() => {
    const activeOrder = snapshot?.nodes.find(node => node.id === snapshot.activeNodeId)?.order ?? -1;
    const matchIds = new Set(matches.map(node => node.id));
    const nodes: ConversationFlowNode[] = visibleMessages.map((message, index) => ({
      id: message.id,
      type: 'conversation',
      position: {
        x: message.role === 'user' ? 24 : message.role === 'assistant' ? 238 : 132,
        y: index * 150 + 24
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false,
      selectable: true,
      deletable: false,
      className: `conversation-flow-node role-${message.role}${message.id === selectedNodeId ? ' selected-by-user' : ''}`,
      data: {
        message,
        active: message.id === snapshot?.activeNodeId,
        matched: matchIds.has(message.id),
        dimmed: Boolean(normalizedQuery && !matchIds.has(message.id)),
        onShowClips
      }
    }));
    const edges: Edge[] = nodes.slice(1).map((node, index) => {
      const source = nodes[index]!;
      const sourceMessage = source.data.message;
      const targetMessage = node.data.message;
      const activePath = targetMessage.order <= activeOrder;
      const omitted = Math.max(0, targetMessage.order - sourceMessage.order - 1);
      return {
        id: `visible-${source.id}-${node.id}`,
        source: source.id,
        target: node.id,
        type: 'smoothstep',
        deletable: false,
        label: onlyClipped && omitted > 0 ? `${omitted} omitted` : undefined,
        labelStyle: { fontSize: 9, fill: '#6d746f' },
        labelBgStyle: { fill: '#eef1ef', fillOpacity: .95 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 5,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
        style: {
          stroke: activePath ? '#3f7d68' : '#aebbb5',
          strokeWidth: activePath ? 2.2 : 1.5,
          strokeDasharray: onlyClipped && omitted > 0 ? '6 5' : undefined
        }
      };
    });
    return { nodes, edges };
  }, [matches, normalizedQuery, onShowClips, onlyClipped, selectedNodeId, snapshot, visibleMessages]);

  flowNodesRef.current = flow.nodes;

  const focusNode = useCallback((nodeId: string) => {
    const node = flowNodesRef.current.find(item => item.id === nodeId);
    if (!node || !instance) return;
    void instance.fitView({ nodes: [node], padding: 1.4, maxZoom: 1.15, duration: 280 });
  }, [instance]);

  useEffect(() => {
    if (!followPage || !snapshot?.activeNodeId) return;
    focusNode(snapshot.activeNodeId);
  }, [focusNode, followPage, snapshot?.activeNodeId]);

  useEffect(() => {
    if (!focusClip || !snapshot) return;
    const sameConversation = focusClip.platform === snapshot.platform && (
      Boolean(focusClip.conversationId && focusClip.conversationId === snapshot.conversationId) ||
      isSameConversationUrl(focusClip.conversationUrl, snapshot.conversationUrl)
    );
    if (!sameConversation) return;
    const target = findConversationNodeForClip(snapshot.nodes, focusClip);
    if (!target || !instance) return;
    setFollowPage(false);
    setSelectedNodeId(target.id);
    window.setTimeout(() => focusNode(target.id), 30);
    onFocusHandled();
  }, [focusClip, focusNode, instance, onFocusHandled, snapshot]);

  const matchSignature = matches.map(node => node.id).join('|');
  useEffect(() => {
    setMatchIndex(0);
    if (matches[0]) window.setTimeout(() => focusNode(matches[0]!.id), 20);
  }, [focusNode, matchSignature, normalizedQuery]);

  const moveMatch = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    focusNode(matches[next]!.id);
  };

  const openMessage = async (nodeId: string) => {
    if (tabId === null || !snapshot) return;
    const message = snapshot.nodes.find(node => node.id === nodeId);
    if (!message) return;
    setSelectedNodeId(nodeId);
    setFollowPage(false);
    setInlineError('');
    await chrome.tabs.update(tabId, { active: true });
    const response = await sendContentMessage(tabId, {
      version: 2,
      type: 'SCROLL_TO_CONVERSATION_NODE',
      nodeId,
      conversationUrl: snapshot.conversationUrl,
      locator: conversationNodeLocator(message)
    }, 12).catch(() => undefined);
    if (response?.type === 'SCROLL_TO_CONVERSATION_NODE_RESULT' && response.ok) {
      setSnapshot(current => current ? { ...current, activeNodeId: nodeId } : current);
      return;
    }
    setInlineError('This message has changed. Refresh the conversation map and try again.');
    await refresh(tabId);
  };

  if (loading && !snapshot) return <ConversationState title="Reading this conversation…" />;
  if (error && !snapshot) return <ConversationState title={error} action="Try again" onAction={() => void refresh()} />;
  if (!snapshot || snapshot.nodes.length === 0) return <ConversationState title="There are no messages to navigate on this page" action="Try again" onAction={() => void refresh()} />;

  return <section className="conversation-map" aria-label="Current conversation map">
    <div className="conversation-map-head">
      <div><strong>{snapshot.conversationTitle}</strong><span>{snapshot.nodes.length} {snapshot.nodes.length === 1 ? 'message' : 'messages'} · visible path</span></div>
      <button onClick={() => void refresh()}>Refresh</button>
      <button onClick={() => void instance?.fitView({ padding: .2, duration: 300 })}>Overview</button>
    </div>
    <div className="conversation-filters" role="group" aria-label="Message range">
      <button className={!onlyClipped ? 'active' : ''} onClick={() => setOnlyClipped(false)}>All messages</button>
      <button className={onlyClipped ? 'active' : ''} onClick={() => setOnlyClipped(true)}>Clipped only <span>{snapshot.nodes.filter(node => node.clipIds.length).length}</span></button>
      <button className={followPage ? 'follow active' : 'follow'} onClick={() => setFollowPage(value => !value)}>Follow page</button>
    </div>
    <div className="conversation-search">
      <input value={query} placeholder="Search this conversation" aria-label="Search this conversation" onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter') moveMatch(event.shiftKey ? -1 : 1);
      }} />
      {normalizedQuery && <><span>{matches.length ? `${matchIndex + 1}/${matches.length}` : '0'}</span><button disabled={!matches.length} onClick={() => moveMatch(-1)}>↑</button><button disabled={!matches.length} onClick={() => moveMatch(1)}>↓</button></>}
    </div>
    {inlineError && <p className="conversation-inline-error" role="status">{inlineError}</p>}
    <div className="conversation-canvas">
      <ReactFlow<ConversationFlowNode, Edge>
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        onInit={setInstance}
        onNodeClick={(_event, node) => void openMessage(node.id)}
        onMoveStart={event => { if (event) setFollowPage(false); }}
        fitView
        fitViewOptions={{ padding: .2 }}
        minZoom={.18}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.05} color="#d2d9d6" />
        <MiniMap pannable zoomable nodeColor={node => {
          const message = (node.data as ConversationNodeData).message;
          return message.role === 'user' ? '#e7b85b' : message.role === 'assistant' ? '#64a189' : '#9aa5a0';
        }} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <p className="map-help">Only the path currently visible on the page is read; the full conversation is not saved. Click a node to open its message. Nodes with a “Clips” badge can open the clip map.</p>
  </section>;
}

function ConversationNodeCard({ data }: NodeProps<ConversationFlowNode>) {
  const { message } = data;
  return <div className={`conversation-node-card${data.active ? ' is-active' : ''}${data.matched ? ' is-match' : ''}${data.dimmed ? ' is-dimmed' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <div className="conversation-node-meta">
      <span>{message.role === 'user' ? 'You' : message.role === 'assistant' ? 'AI' : 'Content'} · {message.order + 1}</span>
      {message.isReport && <i>Report</i>}
      {message.branch && <i>Branch {message.branch.index}/{message.branch.count}</i>}
      {data.active && <i className="current">Current</i>}
    </div>
    <strong className="conversation-node-title">{message.title}</strong>
    <p className="conversation-node-preview">{message.text || 'Empty message'}</p>
    {message.clipIds.length > 0 && <button className="conversation-clip-badge nodrag" onClick={event => {
      event.stopPropagation();
      data.onShowClips(message.clipIds);
    }}>Clips {message.clipIds.length} →</button>}
    <Handle type="source" position={Position.Bottom} />
  </div>;
}

function ConversationState({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="conversation-state"><div>⌘</div><strong>{title}</strong>{action && <button onClick={onAction}>{action}</button>}</div>;
}
