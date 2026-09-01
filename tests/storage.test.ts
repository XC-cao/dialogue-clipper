import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteClip, loadState, moveClipToNotebook, normalizeState, restoreDeletedClip, restoreMovedClip, saveState, setClipParent, updateMindMapPositions } from '../lib/storage';
import type { Clip, StoredState } from '../lib/models';

let bucket: Record<string, unknown>;

beforeEach(() => {
  bucket = {};
  vi.stubGlobal('chrome', { storage: { local: {
    get: vi.fn(async (key: string) => ({ [key]: bucket[key] })),
    set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(bucket, value); })
  }}});
});

const makeClip = (id: string, parentClipId?: string): Clip => ({
  id, parentClipId, notebookId: 'n', originalText: id, annotation: '', platform: 'chatgpt',
  conversationTitle: 't', conversationUrl: 'https://chatgpt.com/c/1', conversationId: '1',
  messageRole: 'assistant', capturedAt: '2026-08-14T00:00:00Z', highlightColor: 'yellow',
  anchor: { exact: id, prefix: '', suffix: '', messageRole: 'assistant', startOffset: 0, endOffset: id.length, status: 'resolved' }
});

describe('storage migration', () => {
  it('无数据时返回独立的空状态', () => {
    const a = normalizeState(undefined);
    const b = normalizeState(undefined);
    a.notebooks.changed = {} as never;
    expect(b.notebooks).toEqual({});
  });

  it('保留已有数据并补齐缺省字段', () => {
    const state = normalizeState({ schemaVersion: 0, notebooks: { n: { id: 'n' } }, clips: {} });
    expect(state.schemaVersion).toBe(1);
    expect(state.currentNotebookId).toBe('n');
    expect(state.pendingCaptures).toEqual([]);
    expect(state.notebooks.n).toMatchObject({ title: 'Untitled notebook', description: '', clipIds: [], schemaVersion: 1 });
    expect(typeof state.notebooks.n!.updatedAt).toBe('string');
  });

  it('清理损坏嵌套记录并把可恢复的孤立摘录放入恢复笔记', () => {
    const state = normalizeState({
      notebooks: { broken: null, n: { id: 'n', title: 42, clipIds: ['missing'] } },
      clips: {
        empty: { id: 'empty' },
        rescued: { id: 'rescued', notebookId: 'gone', originalText: '仍要保留的原文', platform: 'unknown', anchor: null }
      },
      currentNotebookId: 'missing'
    });
    expect(state.clips.empty).toBeUndefined();
    expect(state.clips.rescued?.anchor.exact).toBe('仍要保留的原文');
    expect(state.clips.rescued?.anchor.status).toBe('unresolved');
    expect(state.notebooks.notebook_recovered?.clipIds).toEqual(['rescued']);
    expect(state.currentNotebookId).toBe('n');
  });

  it('保存父子连接并拒绝循环关系', async () => {
    const state: StoredState = {
      schemaVersion: 1, currentNotebookId: 'n', pendingCaptures: [],
      notebooks: { n: { id: 'n', title: '主题', description: '', clipIds: ['a', 'b', 'c'], createdAt: '2026-08-14', updatedAt: '2026-08-14', schemaVersion: 1 } },
      clips: { a: makeClip('a'), b: makeClip('b'), c: makeClip('c') }
    };
    await saveState(state);
    expect(await setClipParent('b', 'a')).toBe(true);
    expect(await setClipParent('c', 'b')).toBe(true);
    expect(await setClipParent('a', 'c')).toBe(false);
    const saved = await loadState();
    expect(saved.clips.b!.parentClipId).toBe('a');
    expect(saved.clips.c!.parentClipId).toBe('b');
    expect(saved.clips.a!.parentClipId).toBeUndefined();
  });

  it('持久化用户拖动后的导图位置', async () => {
    const state: StoredState = {
      schemaVersion: 1, currentNotebookId: 'n', pendingCaptures: [], clips: {},
      notebooks: { n: { id: 'n', title: '主题', description: '', clipIds: [], createdAt: '2026-08-14', updatedAt: '2026-08-14', schemaVersion: 1 } }
    };
    await saveState(state);
    await updateMindMapPositions('n', { a: { x: 120, y: 88 } });
    await updateMindMapPositions('n', { b: { x: 360, y: 144 } });
    expect((await loadState()).notebooks.n!.mindMapPositions).toEqual({
      a: { x: 120, y: 88 }, b: { x: 360, y: 144 }
    });
  });

  it('删除导图节点时回挂子节点并清理保存的位置', async () => {
    const state: StoredState = {
      schemaVersion: 1, currentNotebookId: 'n', pendingCaptures: [],
      notebooks: {
        n: {
          id: 'n', title: '主题', description: '', clipIds: ['a', 'b'],
          mindMapPositions: { a: { x: 120, y: 88 }, b: { x: 360, y: 144 } },
          createdAt: '2026-08-14', updatedAt: '2026-08-14', schemaVersion: 1
        }
      },
      clips: { a: makeClip('a'), b: makeClip('b', 'a') }
    };
    await saveState(state);
    const snapshot = await deleteClip('a');
    const saved = await loadState();
    expect(saved.clips.a).toBeUndefined();
    expect(saved.clips.b?.parentClipId).toBeUndefined();
    expect(saved.notebooks.n?.clipIds).toEqual(['b']);
    expect(saved.notebooks.n?.mindMapPositions).toEqual({ b: { x: 360, y: 144 } });

    expect(snapshot).toBeDefined();
    expect(await restoreDeletedClip(snapshot!)).toBe(true);
    const restored = await loadState();
    expect(restored.notebooks.n?.clipIds).toEqual(['a', 'b']);
    expect(restored.clips.b?.parentClipId).toBe('a');
    expect(restored.notebooks.n?.mindMapPositions).toEqual({
      a: { x: 120, y: 88 }, b: { x: 360, y: 144 }
    });
    expect(await restoreDeletedClip(snapshot!)).toBe(false);
  });

  it('把单张摘录迁移到其他笔记并清理跨笔记关系与旧位置', async () => {
    const state: StoredState = {
      schemaVersion: 1, currentNotebookId: 'source', pendingCaptures: [],
      notebooks: {
        source: {
          id: 'source', title: '来源', description: '', clipIds: ['a', 'b'],
          mindMapPositions: { a: { x: 120, y: 88 }, b: { x: 360, y: 144 } },
          createdAt: '2026-08-14', updatedAt: '2026-08-14', schemaVersion: 1
        },
        target: {
          id: 'target', title: '目标', description: '', clipIds: ['c'],
          mindMapPositions: { c: { x: 80, y: 40 } },
          createdAt: '2026-08-14', updatedAt: '2026-08-14', schemaVersion: 1
        }
      },
      clips: {
        a: { ...makeClip('a'), notebookId: 'source' },
        b: { ...makeClip('b', 'a'), notebookId: 'source' },
        c: { ...makeClip('c'), notebookId: 'target' }
      }
    };
    await saveState(state);

    const snapshot = await moveClipToNotebook('a', 'target');
    expect(snapshot).toMatchObject({
      clipId: 'a', sourceNotebookId: 'source', targetNotebookId: 'target', sourceIndex: 0,
      childIds: ['b'], position: { x: 120, y: 88 }
    });
    expect(await moveClipToNotebook('a', 'target')).toBeUndefined();
    expect(await moveClipToNotebook('a', 'missing')).toBeUndefined();

    const saved = await loadState();
    expect(saved.notebooks.source?.clipIds).toEqual(['b']);
    expect(saved.notebooks.target?.clipIds).toEqual(['c', 'a']);
    expect(saved.notebooks.source?.mindMapPositions).toEqual({ b: { x: 360, y: 144 } });
    expect(saved.notebooks.target?.mindMapPositions).toEqual({ c: { x: 80, y: 40 } });
    expect(saved.clips.a).toMatchObject({ notebookId: 'target' });
    expect(saved.clips.a?.parentClipId).toBeUndefined();
    expect(saved.clips.b?.parentClipId).toBeUndefined();

    expect(await restoreMovedClip(snapshot!)).toBe(true);
    const restored = await loadState();
    expect(restored.notebooks.source?.clipIds).toEqual(['a', 'b']);
    expect(restored.notebooks.target?.clipIds).toEqual(['c']);
    expect(restored.notebooks.source?.mindMapPositions).toEqual({
      a: { x: 120, y: 88 }, b: { x: 360, y: 144 }
    });
    expect(restored.clips.a).toMatchObject({ notebookId: 'source' });
    expect(restored.clips.b?.parentClipId).toBe('a');
    expect(await restoreMovedClip(snapshot!)).toBe(false);
  });
});
