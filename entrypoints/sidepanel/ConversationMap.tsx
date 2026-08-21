import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position,
  ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance
} from '@xyflow/react';
import {
  conversationNodeLocator, isConversationGraphSnapshot,
  type ConversationGraphNode,
  type ConversationGraphSnapshot
} from '../../lib/conversation-graph';
import type { ExtensionMessage } from '../../lib/messages';
import { isSupportedConversationUrl } from '../../lib/conversation-url';

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
  focusClipId?: string;
  targetTabId?: number;
  onFocusHandled: () => void;
}

export function ConversationMap({ onShowClips, focusClipId, targetTabId, onFocusHandled }: ConversationMapProps) {
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
      setError('请先打开 ChatGPT、Claude 或 Gemini 对话');
      setLoading(false);
      return;
    }
    const previousTabId = tabIdRef.current;
    if (previousTabId !== null && previousTabId !== tab.id) {
      void chrome.tabs.sendMessage(previousTabId, { version: 1, type: 'STOP_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
    }
    setTabId(tab.id);
    tabIdRef.current = tab.id;
    try {
      await chrome.tabs.sendMessage(tab.id, { version: 1, type: 'START_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
      const response = await chrome.tabs.sendMessage(tab.id, {
        version: 1,
        type: 'GET_CONVERSATION_GRAPH'
      } satisfies ExtensionMessage) as ExtensionMessage;
      if (requestId !== requestIdRef.current || tabIdRef.current !== tab.id) return;
      if (response.type !== 'CONVERSATION_GRAPH_RESULT' || !response.ok || !isConversationGraphSnapshot(response.snapshot)) {
        throw new Error(response.type === 'CONVERSATION_GRAPH_RESULT' ? response.error : 'invalid response');
      }
      conversationUrlRef.current = response.snapshot.conversationUrl;
      setSnapshot(response.snapshot);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setSnapshot(null);
      setError('暂时无法读取对话，请刷新网页后重试');
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
      if (sender.tab?.id !== tabIdRef.current || value?.version !== 1) return;
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
      if (currentTabId !== null) void chrome.tabs.sendMessage(currentTabId, { version: 1, type: 'START_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
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
      if (currentTabId !== null) void chrome.tabs.sendMessage(currentTabId, { version: 1, type: 'STOP_CONVERSATION_GRAPH' } satisfies ExtensionMessage).catch(() => undefined);
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
        y: index * 126 + 24
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
        label: onlyClipped && omitted > 0 ? `省略 ${omitted} 条` : undefined,
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
    if (!focusClipId || !snapshot) return;
    const target = snapshot.nodes.find(node => node.clipIds.includes(focusClipId));
    if (!target || !instance) return;
    setFollowPage(false);
    setSelectedNodeId(target.id);
    window.setTimeout(() => focusNode(target.id), 30);
    onFocusHandled();
  }, [focusClipId, focusNode, instance, onFocusHandled, snapshot]);

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
    const response = await chrome.tabs.sendMessage(tabId, {
      version: 1,
      type: 'SCROLL_TO_CONVERSATION_NODE',
      nodeId,
      conversationUrl: snapshot.conversationUrl,
      locator: conversationNodeLocator(message)
    } satisfies ExtensionMessage).catch(() => undefined) as ExtensionMessage | undefined;
    if (response?.type === 'SCROLL_TO_CONVERSATION_NODE_RESULT' && response.ok) {
      setSnapshot(current => current ? { ...current, activeNodeId: nodeId } : current);
      return;
    }
    setInlineError('消息内容已经变化，请刷新对话图后重试');
    await refresh(tabId);
  };

  if (loading && !snapshot) return <ConversationState title="正在读取当前对话…" />;
  if (error && !snapshot) return <ConversationState title={error} action="重新读取" onAction={() => void refresh()} />;
  if (!snapshot || snapshot.nodes.length === 0) return <ConversationState title="当前页面还没有可导航的消息" action="重新读取" onAction={() => void refresh()} />;

  return <section className="conversation-map" aria-label="当前对话导航图">
    <div className="conversation-map-head">
      <div><strong>{snapshot.conversationTitle}</strong><span>{snapshot.nodes.length} 条消息 · 当前可见路径</span></div>
      <button onClick={() => void refresh()}>刷新</button>
      <button onClick={() => void instance?.fitView({ padding: .2, duration: 300 })}>全览</button>
    </div>
    <div className="conversation-filters" role="group" aria-label="消息范围">
      <button className={!onlyClipped ? 'active' : ''} onClick={() => setOnlyClipped(false)}>全部消息</button>
      <button className={onlyClipped ? 'active' : ''} onClick={() => setOnlyClipped(true)}>仅看摘录 <span>{snapshot.nodes.filter(node => node.clipIds.length).length}</span></button>
      <button className={followPage ? 'follow active' : 'follow'} onClick={() => setFollowPage(value => !value)}>跟随网页</button>
    </div>
    <div className="conversation-search">
      <input value={query} placeholder="搜索当前对话" aria-label="搜索当前对话" onChange={event => setQuery(event.target.value)} onKeyDown={event => {
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
    <p className="map-help">只读取网页当前可见路径，不保存完整对话。单击节点返回消息；带“摘录”徽标的节点可切换到摘录图。</p>
  </section>;
}

function ConversationNodeCard({ data }: NodeProps<ConversationFlowNode>) {
  const { message } = data;
  return <div className={`conversation-node-card${data.active ? ' is-active' : ''}${data.matched ? ' is-match' : ''}${data.dimmed ? ' is-dimmed' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <div className="conversation-node-meta">
      <span>{message.role === 'user' ? '我' : message.role === 'assistant' ? 'AI' : '内容'} · {message.order + 1}</span>
      {message.isReport && <i>报告</i>}
      {message.branch && <i>分支 {message.branch.index}/{message.branch.count}</i>}
      {data.active && <i className="current">当前</i>}
    </div>
    <strong>{message.text || '空消息'}</strong>
    {message.clipIds.length > 0 && <button className="conversation-clip-badge nodrag" onClick={event => {
      event.stopPropagation();
      data.onShowClips(message.clipIds);
    }}>摘录 {message.clipIds.length} →</button>}
    <Handle type="source" position={Position.Bottom} />
  </div>;
}

function ConversationState({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="conversation-state"><div>⌘</div><strong>{title}</strong>{action && <button onClick={onAction}>{action}</button>}</div>;
}
