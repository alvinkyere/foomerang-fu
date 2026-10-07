export type Direction = 'up' | 'down' | 'left' | 'right';

export interface FocusRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const centre = (r: FocusRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * Spatial navigation: from `currentId`, the best item in `direction`, or `currentId` itself at an
 * edge (focus never leaves, jumps or wraps unexpectedly). Candidates must lie beyond the current
 * item's centre along the travel axis; the score punishes drifting off-axis twice as hard as
 * distance, so an aligned neighbour beats a nearer diagonal one. Ties go to the lowest id, so the
 * result is deterministic. Pure: callers supply measured rectangles.
 */
export function pickNext(
  items: readonly FocusRect[],
  currentId: string,
  direction: Direction,
): string | undefined {
  const from = items.find((i) => i.id === currentId);
  if (from === undefined) return undefined;
  const c = centre(from);
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'right' || direction === 'down' ? 1 : -1;

  let best: { id: string; score: number } | undefined;
  for (const item of items) {
    if (item.id === currentId) continue;
    const p = centre(item);
    const along = (horizontal ? p.x - c.x : p.y - c.y) * sign;
    if (along <= 0) continue;
    const off = Math.abs(horizontal ? p.y - c.y : p.x - c.x);
    const score = along + off * 2;
    if (best === undefined || score < best.score || (score === best.score && item.id < best.id)) {
      best = { id: item.id, score };
    }
  }
  return best?.id ?? currentId;
}
