import type { Clip } from './models';

export interface ClipTreeNode {
  clip: Clip;
  children: ClipTreeNode[];
}

export interface ClipFocusResolution {
  clips: Clip[];
  ambiguous: boolean;
  omittedOtherNotebooks: boolean;
}

/** Chooses every matching clip in one notebook instead of arbitrarily taking the first. */
export function resolveClipFocus(candidates: Clip[], currentNotebookId?: string): ClipFocusResolution {
  const inCurrentNotebook = currentNotebookId
    ? candidates.filter(clip => clip.notebookId === currentNotebookId)
    : [];
  if (inCurrentNotebook.length) {
    return {
      clips: inCurrentNotebook,
      ambiguous: false,
      omittedOtherNotebooks: inCurrentNotebook.length < candidates.length
    };
  }
  const notebookIds = new Set(candidates.map(clip => clip.notebookId));
  if (notebookIds.size > 1) return { clips: [], ambiguous: true, omittedOtherNotebooks: false };
  return { clips: candidates, ambiguous: false, omittedOtherNotebooks: false };
}

export function buildClipTree(clips: Clip[]): ClipTreeNode[] {
  const byId = new Map(clips.map(clip => [clip.id, clip]));
  const children = new Map<string, Clip[]>();
  const roots: Clip[] = [];
  for (const clip of clips) {
    if (!clip.parentClipId || !byId.has(clip.parentClipId) || clip.parentClipId === clip.id) roots.push(clip);
    else children.set(clip.parentClipId, [...(children.get(clip.parentClipId) ?? []), clip]);
  }
  const makeNode = (clip: Clip, ancestors: Set<string>): ClipTreeNode => {
    if (ancestors.has(clip.id)) return { clip, children: [] };
    const next = new Set(ancestors).add(clip.id);
    return { clip, children: (children.get(clip.id) ?? []).map(child => makeNode(child, next)) };
  };
  const tree = roots.map(clip => makeNode(clip, new Set()));
  const included = new Set<string>();
  const visit = (nodes: ClipTreeNode[]) => nodes.forEach(node => { included.add(node.clip.id); visit(node.children); });
  visit(tree);
  for (const clip of clips) if (!included.has(clip.id)) tree.push(makeNode(clip, new Set()));
  return tree;
}

export function validParentOptions(clip: Clip, clips: Clip[]): Clip[] {
  const byId = new Map(clips.map(item => [item.id, item]));
  const invalid = new Set([clip.id]);
  for (const candidate of clips) {
    let current: Clip | undefined = candidate;
    const visited = new Set<string>();
    while (current?.parentClipId && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.parentClipId === clip.id) {
        invalid.add(candidate.id);
        break;
      }
      current = byId.get(current.parentClipId);
    }
  }
  return clips.filter(item => !invalid.has(item.id));
}
