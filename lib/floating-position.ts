export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface FloatingPosition { left: number; top: number }

const EDGE_GAP = 8;
const CONTROL_GAP = 8;
const BUTTON_WIDTH = 76;
const BUTTON_HEIGHT = 32;

function overlaps(position: FloatingPosition, blocker: RectLike, gap = 0): boolean {
  return position.left < blocker.right + gap &&
    position.left + BUTTON_WIDTH > blocker.left - gap &&
    position.top < blocker.bottom + gap &&
    position.top + BUTTON_HEIGHT > blocker.top - gap;
}

/**
 * Places the clip button above a selection. When a site's own selection
 * controls occupy that position, it walks to the end of that control row.
 * If the row reaches the viewport edge, it falls back below the selection.
 */
export function resolveFloatingPosition(
  selection: RectLike,
  blockers: RectLike[],
  viewport: { width: number; height: number }
): FloatingPosition {
  let position = {
    left: Math.min(viewport.width - BUTTON_WIDTH - EDGE_GAP, Math.max(EDGE_GAP, selection.left + selection.width / 2 - BUTTON_WIDTH / 2)),
    top: Math.max(EDGE_GAP, selection.top - BUTTON_HEIGHT - 10)
  };

  const nearby = blockers.filter(blocker =>
    blocker.right >= selection.left - 160 &&
    blocker.left <= selection.right + 160 &&
    blocker.bottom >= selection.top - 100 &&
    blocker.top <= selection.bottom + 100
  );

  // Native toolbars are often made of adjacent buttons. Re-check after each
  // move so the clip button lands after the complete row, not over its tail.
  for (let index = 0; index <= nearby.length; index += 1) {
    const blocker = nearby.find(item => overlaps(position, item, CONTROL_GAP));
    if (!blocker) {
      if (position.left + BUTTON_WIDTH <= viewport.width - EDGE_GAP) return position;
      break;
    }
    position = {
      left: blocker.right + CONTROL_GAP,
      top: Math.max(EDGE_GAP, blocker.top + blocker.height / 2 - BUTTON_HEIGHT / 2)
    };
  }

  position = {
    left: Math.min(viewport.width - BUTTON_WIDTH - EDGE_GAP, Math.max(EDGE_GAP, selection.right - BUTTON_WIDTH)),
    top: Math.min(viewport.height - BUTTON_HEIGHT - EDGE_GAP, selection.bottom + 10)
  };
  return position;
}
