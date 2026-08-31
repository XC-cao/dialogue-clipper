import {
  EMPTY_STATE,
  SCHEMA_VERSION,
  type CapturePayload,
  type Clip,
  type HighlightColor,
  type Notebook,
  type StoredState
} from './models';

const STORAGE_KEY = 'dialogueClipperState';
const FALLBACK_TIME = '1970-01-01T00:00:00.000Z';
let queue = Promise.resolve();

export interface DeletedClipSnapshot {
  clip: Clip;
  index: number;
  childIds: string[];
  position?: { x: number; y: number };
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function normalizeState(value: unknown): StoredState {
  if (!value || typeof value !== 'object') return structuredClone(EMPTY_STATE);
  const raw = value as Partial<StoredState>;
  const notebooks: Record<string, Notebook> = {};
  const clips: Record<string, Clip> = {};

  if (isRecord(raw.notebooks)) {
    for (const [key, value] of Object.entries(raw.notebooks)) {
      if (!isRecord(value)) continue;
      const notebookId = stringValue(value.id, key);
      const positions = isRecord(value.mindMapPositions)
        ? Object.fromEntries(Object.entries(value.mindMapPositions).flatMap(([id, position]) => {
          if (!isRecord(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return [];
          return [[id, { x: Number(position.x), y: Number(position.y) }]];
        }))
        : undefined;
      notebooks[notebookId] = {
        id: notebookId,
        title: stringValue(value.title, 'Untitled notebook'),
        description: stringValue(value.description, ''),
        clipIds: Array.isArray(value.clipIds) ? [...new Set(value.clipIds.filter((id): id is string => typeof id === 'string'))] : [],
        mindMapPositions: positions && Object.keys(positions).length ? positions : undefined,
        createdAt: stringValue(value.createdAt, FALLBACK_TIME),
        updatedAt: stringValue(value.updatedAt, FALLBACK_TIME),
        schemaVersion: SCHEMA_VERSION
      };
    }
  }

  if (isRecord(raw.clips)) {
    for (const [key, value] of Object.entries(raw.clips)) {
      const clip = normalizeClip(key, value);
      if (clip) clips[clip.id] = clip;
    }
  }

  const orphaned = Object.values(clips).filter(clip => !notebooks[clip.notebookId]);
  if (orphaned.length) {
    let recoveredId = 'notebook_recovered';
    while (notebooks[recoveredId]) recoveredId += '_1';
    notebooks[recoveredId] = {
      id: recoveredId,
      title: 'Recovered clips',
      description: 'Recovered from incomplete legacy or corrupted data.',
      clipIds: [],
      createdAt: FALLBACK_TIME,
      updatedAt: FALLBACK_TIME,
      schemaVersion: SCHEMA_VERSION
    };
    orphaned.forEach(clip => { clip.notebookId = recoveredId; });
  }

  for (const notebook of Object.values(notebooks)) {
    notebook.clipIds = notebook.clipIds.filter(clipId => clips[clipId]?.notebookId === notebook.id);
    for (const clip of Object.values(clips)) {
      if (clip.notebookId === notebook.id && !notebook.clipIds.includes(clip.id)) notebook.clipIds.push(clip.id);
    }
  }

  const currentNotebookId = typeof raw.currentNotebookId === 'string' && notebooks[raw.currentNotebookId]
    ? raw.currentNotebookId
    : Object.keys(notebooks)[0] ?? null;
  return {
    schemaVersion: SCHEMA_VERSION,
    notebooks,
    clips,
    currentNotebookId,
    pendingCaptures: Array.isArray(raw.pendingCaptures)
      ? raw.pendingCaptures.flatMap(value => {
        const payload = normalizeCapturePayload(value);
        return payload ? [payload] : [];
      })
      : []
  };
}

function normalizeClip(key: string, value: unknown): Clip | undefined {
  if (!isRecord(value) || typeof value.originalText !== 'string' || !value.originalText.trim()) return undefined;
  const id = stringValue(value.id, key);
  const payload = normalizeCapturePayload(value);
  if (!payload) return undefined;
  const highlightColor = ['yellow', 'green', 'blue', 'pink'].includes(String(value.highlightColor))
    ? value.highlightColor as HighlightColor
    : 'yellow';
  return {
    id,
    notebookId: stringValue(value.notebookId, ''),
    parentClipId: typeof value.parentClipId === 'string' && value.parentClipId !== id ? value.parentClipId : undefined,
    ...payload,
    annotation: stringValue(value.annotation, ''),
    capturedAt: stringValue(value.capturedAt, FALLBACK_TIME),
    highlightColor
  };
}

function normalizeCapturePayload(value: unknown): CapturePayload | undefined {
  if (!isRecord(value) || typeof value.originalText !== 'string' || !value.originalText.trim()) return undefined;
  const originalText = value.originalText;
  const platform = ['chatgpt', 'claude', 'gemini'].includes(String(value.platform))
    ? value.platform as CapturePayload['platform']
    : 'chatgpt';
  const messageRole = ['user', 'assistant', 'unknown'].includes(String(value.messageRole))
    ? value.messageRole as CapturePayload['messageRole']
    : 'unknown';
  const rawAnchor = isRecord(value.anchor) ? value.anchor : {};
  const anchorRole = ['user', 'assistant', 'unknown'].includes(String(rawAnchor.messageRole))
    ? rawAnchor.messageRole as CapturePayload['messageRole']
    : messageRole;
  const startOffset = Number.isFinite(rawAnchor.startOffset) ? Math.max(0, Number(rawAnchor.startOffset)) : 0;
  const endOffset = Number.isFinite(rawAnchor.endOffset) ? Math.max(startOffset, Number(rawAnchor.endOffset)) : startOffset + originalText.length;
  return {
    originalText,
    platform,
    conversationTitle: stringValue(value.conversationTitle, 'Recovered clip'),
    conversationUrl: stringValue(value.conversationUrl, ''),
    conversationId: stringValue(value.conversationId, ''),
    messageRole,
    anchor: {
      exact: stringValue(rawAnchor.exact, originalText),
      prefix: stringValue(rawAnchor.prefix, ''),
      suffix: stringValue(rawAnchor.suffix, ''),
      messageId: typeof rawAnchor.messageId === 'string' ? rawAnchor.messageId : undefined,
      messageRole: anchorRole,
      startOffset,
      endOffset,
      domPath: typeof rawAnchor.domPath === 'string' ? rawAnchor.domPath : undefined,
      status: rawAnchor.status === 'resolved' ? 'resolved' : 'unresolved'
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export async function loadState(): Promise<StoredState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeState(result[STORAGE_KEY]);
}

export async function saveState(state: StoredState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export function updateState(mutator: (state: StoredState) => void | StoredState): Promise<StoredState> {
  const write = async () => {
    const state = await loadState();
    const next = mutator(state) ?? state;
    await saveState(next);
    return next;
  };
  const guardedWrite = async (): Promise<StoredState> => {
    if (!globalThis.navigator?.locks) return write();
    const locked = await globalThis.navigator.locks.request('dialogue-clipper-state-write', write);
    return await locked;
  };
  const operation = queue.then(guardedWrite);
  queue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function createNotebook(title: string, description = ''): Promise<Notebook> {
  const now = new Date().toISOString();
  const notebook: Notebook = {
    id: id('notebook'), title: title.trim(), description: description.trim(), clipIds: [],
    createdAt: now, updatedAt: now, schemaVersion: SCHEMA_VERSION
  };
  await updateState(state => {
    state.notebooks[notebook.id] = notebook;
    state.currentNotebookId = notebook.id;
  });
  return notebook;
}

export async function addCapture(payload: CapturePayload): Promise<{ clip?: Clip; pending: boolean }> {
  let clip: Clip | undefined;
  let pending = false;
  await updateState(state => {
    const notebookId = state.currentNotebookId;
    const notebook = notebookId ? state.notebooks[notebookId] : undefined;
    if (!notebook) {
      state.currentNotebookId = null;
      state.pendingCaptures.push(payload);
      pending = true;
      return;
    }
    clip = {
      id: id('clip'), notebookId: notebook.id, ...payload,
      annotation: '', capturedAt: new Date().toISOString(), highlightColor: 'yellow'
    };
    state.clips[clip.id] = clip;
    notebook.clipIds.push(clip.id);
    notebook.updatedAt = clip.capturedAt;
  });
  return { clip, pending };
}

export async function assignPending(notebookId: string): Promise<void> {
  await updateState(state => {
    const notebook = state.notebooks[notebookId];
    if (!notebook) return;
    for (const payload of state.pendingCaptures) {
      const clip: Clip = {
        id: id('clip'), notebookId, ...payload, annotation: '',
        capturedAt: new Date().toISOString(), highlightColor: 'yellow'
      };
      state.clips[clip.id] = clip;
      notebook.clipIds.push(clip.id);
    }
    state.pendingCaptures = [];
    state.currentNotebookId = notebookId;
    notebook.updatedAt = new Date().toISOString();
  });
}

export async function updateNotebook(notebookId: string, patch: Pick<Notebook, 'title' | 'description'>): Promise<void> {
  await updateState(state => {
    const notebook = state.notebooks[notebookId];
    if (!notebook) return;
    notebook.title = patch.title.trim();
    notebook.description = patch.description.trim();
    notebook.updatedAt = new Date().toISOString();
  });
}

export async function updateMindMapPositions(notebookId: string, positions: Record<string, { x: number; y: number }>): Promise<void> {
  await updateState(state => {
    const notebook = state.notebooks[notebookId];
    if (!notebook) return;
    notebook.mindMapPositions = { ...(notebook.mindMapPositions ?? {}), ...positions };
  });
}

export async function deleteNotebook(notebookId: string): Promise<void> {
  await updateState(state => {
    const notebook = state.notebooks[notebookId];
    if (!notebook) return;
    for (const clipId of notebook.clipIds) delete state.clips[clipId];
    delete state.notebooks[notebookId];
    if (state.currentNotebookId === notebookId) state.currentNotebookId = Object.keys(state.notebooks)[0] ?? null;
  });
}

export async function deleteClip(clipId: string): Promise<DeletedClipSnapshot | undefined> {
  let snapshot: DeletedClipSnapshot | undefined;
  await updateState(state => {
    const clip = state.clips[clipId];
    if (!clip) return;
    const notebook = state.notebooks[clip.notebookId];
    const childIds = Object.values(state.clips).filter(child => child.parentClipId === clipId).map(child => child.id);
    snapshot = {
      clip: structuredClone(clip),
      index: Math.max(0, notebook?.clipIds.indexOf(clipId) ?? 0),
      childIds,
      position: notebook?.mindMapPositions?.[clipId] ? { ...notebook.mindMapPositions[clipId]! } : undefined
    };
    if (notebook) {
      notebook.clipIds = notebook.clipIds.filter(id => id !== clipId);
      if (notebook.mindMapPositions) {
        delete notebook.mindMapPositions[clipId];
        if (!Object.keys(notebook.mindMapPositions).length) delete notebook.mindMapPositions;
      }
      notebook.updatedAt = new Date().toISOString();
    }
    for (const child of Object.values(state.clips)) {
      if (child.parentClipId === clipId) delete child.parentClipId;
    }
    delete state.clips[clipId];
  });
  return snapshot;
}

export async function restoreDeletedClip(snapshot: DeletedClipSnapshot): Promise<boolean> {
  let restored = false;
  await updateState(state => {
    const notebook = state.notebooks[snapshot.clip.notebookId];
    if (!notebook || state.clips[snapshot.clip.id]) return;
    const clip = structuredClone(snapshot.clip);
    if (clip.parentClipId && !state.clips[clip.parentClipId]) delete clip.parentClipId;
    state.clips[clip.id] = clip;
    const index = Math.min(Math.max(0, snapshot.index), notebook.clipIds.length);
    notebook.clipIds.splice(index, 0, clip.id);
    if (snapshot.position) {
      notebook.mindMapPositions = { ...(notebook.mindMapPositions ?? {}), [clip.id]: { ...snapshot.position } };
    }
    for (const childId of snapshot.childIds) {
      const child = state.clips[childId];
      if (child?.notebookId === notebook.id && !child.parentClipId) child.parentClipId = clip.id;
    }
    notebook.updatedAt = new Date().toISOString();
    restored = true;
  });
  return restored;
}

export async function updateClip(clipId: string, patch: { annotation?: string; highlightColor?: HighlightColor }): Promise<void> {
  await updateState(state => {
    const clip = state.clips[clipId];
    if (!clip) return;
    if (patch.annotation !== undefined) clip.annotation = patch.annotation;
    if (patch.highlightColor !== undefined) clip.highlightColor = patch.highlightColor;
    const notebook = state.notebooks[clip.notebookId];
    if (notebook) notebook.updatedAt = new Date().toISOString();
  });
}

export async function setClipParent(clipId: string, parentClipId?: string): Promise<boolean> {
  let changed = false;
  await updateState(state => {
    const clip = state.clips[clipId];
    if (!clip) return;
    if (!parentClipId) {
      delete clip.parentClipId;
      changed = true;
    } else {
      const parent = state.clips[parentClipId];
      if (!parent || parent.notebookId !== clip.notebookId || parent.id === clip.id) return;
      let current: Clip | undefined = parent;
      const visited = new Set<string>();
      while (current) {
        if (current.id === clip.id || visited.has(current.id)) return;
        visited.add(current.id);
        current = current.parentClipId ? state.clips[current.parentClipId] : undefined;
      }
      clip.parentClipId = parent.id;
      changed = true;
    }
    const notebook = state.notebooks[clip.notebookId];
    if (notebook && changed) notebook.updatedAt = new Date().toISOString();
  });
  return changed;
}

export async function reorderClips(notebookId: string, clipIds: string[]): Promise<void> {
  await updateState(state => {
    const notebook = state.notebooks[notebookId];
    if (!notebook) return;
    const expected = new Set(notebook.clipIds);
    if (clipIds.length !== expected.size || clipIds.some(id => !expected.has(id))) return;
    notebook.clipIds = clipIds;
    notebook.updatedAt = new Date().toISOString();
  });
}

export async function selectNotebook(notebookId: string): Promise<void> {
  await updateState(state => { if (state.notebooks[notebookId]) state.currentNotebookId = notebookId; });
}
