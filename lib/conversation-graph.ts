import type { Clip, MessageRole, Platform } from './models';
import type { ConversationMetadata } from './adapters/types';

export interface ConversationBranchInfo {
  index: number;
  count: number;
}

export interface ConversationGraphNode {
  id: string;
  messageId?: string;
  role: MessageRole;
  /** Short text rendered on the map card. */
  text: string;
  /** Search/association text kept only in the in-memory graph snapshot. */
  searchText: string;
  fingerprint: string;
  order: number;
  clipIds: string[];
  branch?: ConversationBranchInfo;
  isReport: boolean;
}

export interface ConversationGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface ConversationGraphSnapshot {
  version: 1;
  platform: Platform;
  conversationTitle: string;
  conversationUrl: string;
  conversationId: string;
  nodes: ConversationGraphNode[];
  edges: ConversationGraphEdge[];
  activeNodeId?: string;
  revision: string;
  capabilities: {
    activePathOnly: true;
    hiddenBranches: false;
  };
  capturedAt: string;
}

export interface ConversationNodeLocator {
  messageId?: string;
  role: MessageRole;
  order: number;
  fingerprint: string;
  quote: string;
}

const MAX_NODES = 600;
const MAX_NODE_SEARCH_TEXT = 20_000;
const MAX_SNAPSHOT_TEXT = 2_000_000;

export function conversationNodeId(conversationId: string, messageId: string | undefined, role: MessageRole, order: number): string {
  const stablePart = messageId ? `id:${messageId}` : `position:${role}:${order}`;
  return `message-${stableHash(`${conversationId}\n${stablePart}`)}`;
}

export function conversationTextFingerprint(text: string): string {
  return stableHash(normalizeGraphText(text));
}

export function conversationNodeLocator(node: ConversationGraphNode): ConversationNodeLocator {
  return {
    messageId: node.messageId,
    role: node.role,
    order: node.order,
    fingerprint: node.fingerprint,
    quote: node.searchText.slice(0, 240)
  };
}

export function attachClipsToConversationNodes(
  nodes: ConversationGraphNode[],
  clips: Clip[],
  fullTextByNodeId?: ReadonlyMap<string, string>
): ConversationGraphNode[] {
  const clipIds = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const clip of clips) {
    const exact = normalizeGraphText(clip.anchor.exact);
    if (!exact) continue;
    const containsExact = (node: ConversationGraphNode) => normalizeGraphText(fullTextByNodeId?.get(node.id) ?? node.searchText).includes(exact);
    const byId = clip.anchor.messageId
      ? nodes.filter(node => node.messageId === clip.anchor.messageId && containsExact(node))
      : [];
    const candidates = byId.length === 1
      ? byId
      : nodes.filter(node => node.role === clip.messageRole && containsExact(node));
    if (candidates.length !== 1) continue;
    clipIds.get(candidates[0]!.id)!.push(clip.id);
  }
  return nodes.map(node => ({ ...node, clipIds: clipIds.get(node.id) ?? [] }));
}

export function buildConversationSnapshot(
  metadata: ConversationMetadata,
  nodes: ConversationGraphNode[],
  activeNodeId?: string
): ConversationGraphSnapshot {
  const ordered = [...nodes].sort((a, b) => a.order - b.order);
  const revision = stableHash(ordered.map(node => `${node.id}:${node.fingerprint}:${node.clipIds.join(',')}:${node.branch?.index ?? 0}/${node.branch?.count ?? 0}`).join('|'));
  return {
    version: 1,
    ...metadata,
    nodes: ordered,
    edges: ordered.slice(1).map((node, index) => ({
      id: `conversation-edge-${ordered[index]!.id}-${node.id}`,
      source: ordered[index]!.id,
      target: node.id
    })),
    activeNodeId: ordered.some(node => node.id === activeNodeId) ? activeNodeId : undefined,
    revision,
    capabilities: { activePathOnly: true, hiddenBranches: false },
    capturedAt: new Date().toISOString()
  };
}

export function isConversationGraphSnapshot(value: unknown): value is ConversationGraphSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ConversationGraphSnapshot>;
  if (
    item.version !== 1 ||
    !['chatgpt', 'claude', 'gemini'].includes(String(item.platform)) ||
    typeof item.conversationTitle !== 'string' || item.conversationTitle.length > 1000 ||
    typeof item.conversationUrl !== 'string' || item.conversationUrl.length > 4096 ||
    typeof item.conversationId !== 'string' || item.conversationId.length > 1000 ||
    typeof item.revision !== 'string' || item.revision.length > 512 ||
    typeof item.capturedAt !== 'string' ||
    !Array.isArray(item.nodes) ||
    item.nodes.length > MAX_NODES ||
    !Array.isArray(item.edges) ||
    item.edges.length > MAX_NODES ||
    item.capabilities?.activePathOnly !== true ||
    item.capabilities.hiddenBranches !== false
  ) return false;
  let totalText = 0;
  const nodeIds = new Set<string>();
  const validNodes = item.nodes.every(node => {
    if (!node || typeof node !== 'object') return false;
    totalText += typeof node.searchText === 'string' ? node.searchText.length : 0;
    if (nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
    return Boolean(
    node &&
    typeof node.id === 'string' && node.id.length <= 512 &&
    (node.messageId === undefined || (typeof node.messageId === 'string' && node.messageId.length <= 512)) &&
    ['user', 'assistant', 'unknown'].includes(String(node.role)) &&
    typeof node.text === 'string' && node.text.length <= 800 &&
    typeof node.searchText === 'string' && node.searchText.length <= MAX_NODE_SEARCH_TEXT &&
    typeof node.fingerprint === 'string' && node.fingerprint.length <= 512 &&
    Number.isInteger(node.order) && node.order >= 0 &&
    typeof node.isReport === 'boolean' &&
    (node.branch === undefined || (
      Number.isInteger(node.branch.index) && Number.isInteger(node.branch.count) &&
      node.branch.index >= 1 && node.branch.count >= 2 && node.branch.index <= node.branch.count
    )) &&
    Array.isArray(node.clipIds) && node.clipIds.length <= 100 &&
    node.clipIds.every(id => typeof id === 'string' && id.length <= 512)
    );
  });
  if (!validNodes || totalText > MAX_SNAPSHOT_TEXT) return false;
  if (item.activeNodeId !== undefined && (typeof item.activeNodeId !== 'string' || !nodeIds.has(item.activeNodeId))) return false;
  return item.edges.every(edge => Boolean(
    edge && typeof edge.id === 'string' && edge.id.length <= 1100 &&
    typeof edge.source === 'string' && nodeIds.has(edge.source) &&
    typeof edge.target === 'string' && nodeIds.has(edge.target)
  ));
}

export function parseBranchInfo(element: HTMLElement): ConversationBranchInfo | undefined {
  const controls = [element, element.parentElement]
    .filter((item): item is HTMLElement => Boolean(item))
    .flatMap(root => Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"], [aria-label], [title]')))
    .slice(0, 80);
  for (const control of controls) {
    const value = `${control.getAttribute('aria-label') ?? ''} ${control.title} ${control.textContent ?? ''}`;
    if (!/(?:response|answer|branch|version|alternative|版本|回复|分支|回答)/i.test(value)) continue;
    const fraction = value.match(/(?:^|\s)(\d{1,3})\s*\/\s*(\d{1,3})(?:\s|$)/);
    const words = value.match(/(?:response|answer|branch|版本|回复|分支)\s*(\d{1,3})\s*(?:of|共|\/|中的)\s*(\d{1,3})/i);
    const match = fraction ?? words;
    if (!match) continue;
    const index = Number(match[1]);
    const count = Number(match[2]);
    if (index >= 1 && count >= 2 && index <= count) return { index, count };
  }
  return undefined;
}

function normalizeGraphText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
