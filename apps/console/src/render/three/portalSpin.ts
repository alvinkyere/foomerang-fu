/**
 * The gong islands' portals (owner, 2026-10-26: "the portals have a certain animation ... exactly like it is in the video"):
 * the "G" on each portal turns in its face's plane, anticlockwise seen from in front, on the curve the HQ shows (measured in
 * art/sky_islands/portals.py, shipped in the map's manifest as `portals`): its angle at points through one period, each
 * period ending a whole turn on from where it began.
 */
export interface PortalSpin {
  /** Seconds a turn takes. */
  readonly period: number;
  /** [seconds into the period, degrees anticlockwise], from 0 to `period`. */
  readonly spin: readonly (readonly [number, number])[];
  /**
   * The ring (optional): a copy of the face's hexagon outline, [seconds into the period, out along the face's normal, up,
   * opacity 0-1], from 0 to `period`, ending where it began.
   */
  readonly ring?: readonly (readonly [number, number, number, number])[];
  /**
   * The swirl as frames (optional; then it is not turned): `count` frames evenly through the period, in an atlas of
   * `columns` x `rows` cells, row by row from the top left.
   */
  readonly frames?: { readonly count: number; readonly columns: number; readonly rows: number };
}

/** Which two frames show, and how far the second has faded in over the first. */
export interface FrameState {
  readonly from: number;
  readonly to: number;
  readonly mix: number;
}

/** Where the ring is and how strong, at a moment. */
export interface RingState {
  readonly out: number;
  readonly up: number;
  readonly opacity: number;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The manifest's `portals`, checked (the manifest is a file we ship, but a bad one must fail loudly). */
export function parsePortalSpin(raw: unknown): PortalSpin | undefined {
  if (raw === undefined) return undefined;
  const bad = (): never => {
    throw new Error('map manifest: bad portals');
  };
  const r = raw as { period?: unknown; spin?: unknown } | null;
  const period = r?.period;
  if (!num(period) || period <= 0 || !Array.isArray(r?.spin) || r.spin.length < 2) return bad();
  const spin: (readonly [number, number])[] = [];
  for (const p of r.spin as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2) return bad();
    const [t, a] = p as unknown[];
    if (!num(t) || !num(a) || t < 0 || t > period) return bad();
    const before = spin[spin.length - 1];
    if (before !== undefined && t <= before[0]) return bad();
    spin.push([t, a]);
  }
  const first = spin[0];
  const last = spin[spin.length - 1];
  // a period must run from its start to its end and end a whole turn on, so period after period joins without a jump
  if (first === undefined || last === undefined) return bad();
  if (first[0] !== 0 || last[0] !== period || Math.abs(last[1] - first[1] - 360) > 1e-6)
    return bad();
  const ring = parseRing((r as { ring?: unknown }).ring, period);
  const frames = parseFrames((r as { frames?: unknown }).frames);
  return {
    period,
    spin,
    ...(ring === undefined ? {} : { ring }),
    ...(frames === undefined ? {} : { frames }),
  };
}

function parseFrames(raw: unknown): PortalSpin['frames'] {
  if (raw === undefined) return undefined;
  const f = raw as { count?: unknown; columns?: unknown; rows?: unknown } | null;
  const whole = (v: unknown): v is number => num(v) && Number.isInteger(v) && v > 0;
  if (!whole(f?.count) || !whole(f.columns) || !whole(f.rows) || f.count > f.columns * f.rows)
    throw new Error('map manifest: bad portals');
  return { count: f.count, columns: f.columns, rows: f.rows };
}

/** The swirl's frames `ms` into the map's clock (undefined: the map's swirl is turned, not framed). */
export function frameAt(s: PortalSpin, ms: number): FrameState | undefined {
  if (s.frames === undefined) return undefined;
  const t = ms / 1000;
  const into = (t - Math.floor(t / s.period) * s.period) / s.period;
  const at = into * s.frames.count;
  const from = Math.floor(at) % s.frames.count;
  return { from, to: (from + 1) % s.frames.count, mix: at - Math.floor(at) };
}

function parseRing(raw: unknown, period: number): PortalSpin['ring'] {
  if (raw === undefined) return undefined;
  const bad = (): never => {
    throw new Error('map manifest: bad portals');
  };
  if (!Array.isArray(raw) || raw.length < 2) return bad();
  const ring: (readonly [number, number, number, number])[] = [];
  for (const p of raw as unknown[]) {
    if (!Array.isArray(p) || p.length !== 4) return bad();
    const [t, out, up, opacity] = p as unknown[];
    if (!num(t) || !num(out) || !num(up) || !num(opacity)) return bad();
    if (t < 0 || t > period || opacity < 0 || opacity > 1) return bad();
    const before = ring[ring.length - 1];
    if (before !== undefined && t <= before[0]) return bad();
    ring.push([t, out, up, opacity]);
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first === undefined || last === undefined || first[0] !== 0 || last[0] !== period)
    return bad();
  return ring;
}

/** The ring `ms` into the map's clock (undefined: the map's portals have none). */
export function ringAt(s: PortalSpin, ms: number): RingState | undefined {
  if (s.ring === undefined) return undefined;
  const t = ms / 1000;
  const into = t - Math.floor(t / s.period) * s.period;
  for (let i = 1; i < s.ring.length; i++) {
    const a = s.ring[i - 1];
    const b = s.ring[i];
    if (a === undefined || b === undefined || into > b[0]) continue;
    const f = (into - a[0]) / (b[0] - a[0]);
    const mix = (k: 1 | 2 | 3) => a[k] + (b[k] - a[k]) * f;
    return { out: mix(1), up: mix(2), opacity: mix(3) };
  }
  const end = s.ring[s.ring.length - 1];
  return end === undefined ? undefined : { out: end[1], up: end[2], opacity: end[3] };
}

/** The "G"'s angle (radians, anticlockwise seen from in front) `ms` into the map's clock. */
export function spinAt(s: PortalSpin, ms: number): number {
  const t = ms / 1000;
  const turns = Math.floor(t / s.period);
  const into = t - turns * s.period;
  let deg = 0;
  for (let i = 1; i < s.spin.length; i++) {
    const a = s.spin[i - 1];
    const b = s.spin[i];
    if (a === undefined || b === undefined) continue;
    deg = b[1];
    if (into <= b[0]) {
      deg = a[1] + ((b[1] - a[1]) * (into - a[0])) / (b[0] - a[0]);
      break;
    }
  }
  return ((deg + 360 * turns) * Math.PI) / 180;
}
