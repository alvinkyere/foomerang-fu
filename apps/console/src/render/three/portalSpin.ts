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
  return { period, spin };
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
