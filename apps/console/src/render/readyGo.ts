/**
 * READY and GO as the HQ video draws them (9:05.66–9:07.32, 60 frames a second; art/physics_reference/README.md, "READY and
 * GO"). Each word is the video's own, traced into vector letters (art/physics_reference/ready_go.py -> public/ui/ready.svg,
 * go.svg), at the screen's middle and the video's size. It pops in, stands, and is cut off; 0.134 s after GO appears, eight
 * short white dashes burst from round it and fade by shrinking. Lengths are the video's px at 1080 px of screen height.
 * Pure: when and where; ThreePlaza draws them.
 */
export const READY_GO = Object.freeze({
  screenHeight: 1080,
  /** The words' boxes as traced (outline included), from the screen's middle: their SVGs' viewBoxes. */
  ready: Object.freeze({ x: -208.8, y: -55, width: 424.8, height: 106 }),
  go: Object.freeze({ x: -95.8, y: -56.1, width: 189.7, height: 108.7 }),
  /** Its size frame by frame as it appears (READY 9:05.656 on; GO pops the same way), then 1. */
  pop: Object.freeze([0.5, 0.72, 0.88, 0.98, 1.035, 1.05, 1.045, 1.026, 1.007, 1]),
  fps: 60,
  sparks: Object.freeze({
    /** After GO appears. */
    from: 0.134,
    life: 0.4,
    /** Where the dashes' outer ends start: an ellipse round the word, at the eight compass points. */
    rx: 141,
    ry: 91,
    /** How much further out they fly (easing out), and how long they start (shrinking to nothing). */
    travel: 28,
    length: 21,
    width: 7,
  }),
});

/** Its size `t` seconds after it appears (1: as traced). */
export function popScale(t: number): number {
  const { pop, fps } = READY_GO;
  const f = t * fps;
  if (f >= pop.length - 1) return 1;
  const i = Math.max(0, Math.floor(f));
  const k = Math.max(0, f - i);
  return (pop[i] ?? 1) + ((pop[i + 1] ?? 1) - (pop[i] ?? 1)) * k;
}

export interface Spark {
  /** Its outer end, from the screen's middle (x right, y down), and how long it is towards the middle. */
  readonly outer: { readonly x: number; readonly y: number };
  readonly length: number;
}

/** GO's dashes `t` seconds after GO appears (none before or after their 0.4 s). */
export function sparks(t: number): Spark[] {
  const { from, life, rx, ry, travel, length } = READY_GO.sparks;
  const s = t - from;
  if (s < 0 || s >= life) return [];
  const u = s / life;
  const out = travel * (1 - (1 - u) * (1 - u));
  return Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    const r = Math.hypot(x, y);
    return { outer: { x: x + (x / r) * out, y: y + (y / r) * out }, length: length * (1 - u) };
  });
}
