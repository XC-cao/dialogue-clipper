import dagre from '@dagrejs/dagre';
import type { Clip, Notebook } from './models';

export const MIND_MAP_ROOT_ID = '__notebook_root__';

export interface MindMapLayout {
  positions: Record<string, { x: number; y: number }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

const ROOT_SIZE = { width: 176, height: 68 };
const CLIP_SIZE = { width: 210, height: 84 };

export function layoutMindMap(notebook: Notebook, clips: Clip[]): MindMapLayout {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', ranksep: 82, nodesep: 34, marginx: 28, marginy: 28 });
  graph.setNode(MIND_MAP_ROOT_ID, { ...ROOT_SIZE });

  const clipIds = new Set(clips.map(clip => clip.id));
  const edges = clips.map(clip => {
    graph.setNode(clip.id, { ...CLIP_SIZE });
    const source = clip.parentClipId && clipIds.has(clip.parentClipId) ? clip.parentClipId : MIND_MAP_ROOT_ID;
    return { id: `edge-${source}-${clip.id}`, source, target: clip.id };
  });
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);

  const positions: MindMapLayout['positions'] = {};
  for (const id of [MIND_MAP_ROOT_ID, ...clips.map(clip => clip.id)]) {
    const point = graph.node(id) as { x: number; y: number; width: number; height: number };
    positions[id] = { x: point.x - point.width / 2, y: point.y - point.height / 2 };
  }

  return { positions, edges };
}
