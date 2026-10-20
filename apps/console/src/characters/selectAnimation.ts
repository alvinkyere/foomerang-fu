/**
 * The character-select animation of game-setting.mp4 (owner, 2026-10-20): while a player's cursor is on a character, its big
 * circle plays an ARRIVAL (the character turns in from the way the cursor moved) and then an IDLE loop (the hands rise in
 * turn, the body rocks and hops a little, now and then it blinks); when its player readies it CHEERS, then idles again. Pre-rendered from the 3D models (art/reconstruction/runtime/bake_select_anims.py) into
 * one sheet per character (pack_select_anims.py): FRAME px cells, COLS to a row: the idle loop, the two arrivals, the READY cheer
 * (the happy face, a lean and one hand thrown up) and the blinks.
 */

export interface SelectSequence {
  readonly start: number;
  readonly count: number;
}

export const SELECT_SHEET = {
  fps: 30,
  frame: 192,
  cols: 8,
  frames: 90,
  sequences: {
    idle: { start: 0, count: 40 },
    arriveLeft: { start: 40, count: 5 },
    arriveRight: { start: 45, count: 5 },
    cheer: { start: 50, count: 28 },
    /** Idle frames again with the eyes shut: BLINK_FRAMES from each of `blinkAt`, in order. */
    blink: { start: 78, count: 12 },
  },
  /** Idle frames a blink may start at, and how long the eyes stay shut (2-3 frames in the video). */
  blinkAt: [0, 10, 20, 30],
  blinkFrames: 3,
} as const;

/** The chance each blink point blinks: one blink every ~2.3 s on average (the video's gaps: 27-124 frames). */
export const BLINK_CHANCE = 1 / 7;

/** The way a cursor moved onto a character: it turns in from that side. */
export type ArrivalSide = 'left' | 'right';

export interface SelectTimeline {
  /** The way the cursor moved onto this character, if it did. */
  readonly arrival?: ArrivalSide | undefined;
  /** When its player readied (ms since it appeared): it cheers from then. */
  readonly cheerFrom?: number | undefined;
  /** Whether the blink chance named `chance` blinks: asked once per chance (the same answer for all its frames). */
  readonly blink: (chance: string) => boolean;
}

/** The idle loop's frame `i` of loop `cycle`, or its blink frame when a blink falls there. */
function idleFrame(i: number, cycle: string, blink: (chance: string) => boolean): number {
  const { blinkAt, blinkFrames, sequences } = SELECT_SHEET;
  const k = blinkAt.findIndex((start) => i >= start && i < start + blinkFrames);
  const start = blinkAt[k];
  if (start !== undefined && blink(`${cycle}:${k}`))
    return sequences.blink.start + k * blinkFrames + (i - start);
  return sequences.idle.start + i;
}

/**
 * The sheet frame to show `ms` after the character appeared. An arrival runs into the idle loop where its side's hand is about
 * to rise (the loop's start after a move left, half a loop in after a move right); a cheer runs into the loop's start.
 */
export function frameAt(ms: number, timeline: SelectTimeline): number {
  const { fps, sequences } = SELECT_SHEET;
  const frames = (t: number) => Math.max(0, Math.floor((t * fps) / 1000 + 1e-6));
  const idle = sequences.idle.count;
  const loop = (n: number, tag: string) =>
    idleFrame(n % idle, `${tag}${Math.floor(n / idle)}`, timeline.blink);
  if (timeline.cheerFrom !== undefined && ms >= timeline.cheerFrom) {
    const c = frames(ms - timeline.cheerFrom);
    if (c < sequences.cheer.count) return sequences.cheer.start + c;
    return loop(c - sequences.cheer.count, 'ready');
  }
  const n = frames(ms);
  if (timeline.arrival === undefined) return loop(n, '');
  const arrive = timeline.arrival === 'left' ? sequences.arriveLeft : sequences.arriveRight;
  if (n < arrive.count) return arrive.start + n;
  return loop((timeline.arrival === 'left' ? 0 : idle / 2) + n - arrive.count, '');
}

/** Where a frame sits in the sheet. */
export const cellOf = (frame: number): { col: number; row: number } => ({
  col: frame % SELECT_SHEET.cols,
  row: Math.floor(frame / SELECT_SHEET.cols),
});

/**
 * Which way a cursor moved, from the character it left to the one it reached, along the grid (`order`, `cols` to a row).
 * Straight up or down a column, or a first landing: no turn (the video shows only sideways moves).
 */
export function arrivalSide(
  order: readonly string[],
  from: string | undefined,
  to: string,
  cols: number,
): ArrivalSide | undefined {
  if (from === undefined || from === to) return undefined;
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return undefined;
  const dx = (b % cols) - (a % cols);
  return dx < 0 ? 'left' : dx > 0 ? 'right' : undefined;
}
