/**
 * A map's portals drawn as a flipbook of traced frames (the autumn glade, ff physics hq 2.mp4 10:26: the cyan strokes change shape
 * through a 5.833 s cycle, measured as the lag at which their shape repeats, similarity 0.964). The map's model carries one mesh per
 * frame per portal, named `PORTAL_<portal>_f<frame>`; one at a time is shown. `lags` are each portal's seconds behind the first
 * (absent: none).
 */
export interface PortalFlip {
  readonly period: number;
  readonly frames: number;
  readonly lags: readonly number[];
}

/** The manifest's `portalFlip`, or undefined when it is absent or malformed (a map's own data: its numbers are checked, not trusted). */
export function parsePortalFlip(raw: unknown): PortalFlip | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const r = raw as { period?: unknown; frames?: unknown; lags?: unknown };
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!finite(r.period) || r.period <= 0) return undefined;
  if (!finite(r.frames) || !Number.isInteger(r.frames) || r.frames < 1) return undefined;
  if (!Array.isArray(r.lags) || !r.lags.every(finite)) return undefined;
  return { period: r.period, frames: r.frames, lags: r.lags as number[] };
}

/** The frame portal `portal` shows at time `tMs` (milliseconds, the renderer's clock). */
export function flipFrameAt(f: PortalFlip, portal: number, tMs: number): number {
  const periodMs = f.period * 1000;
  const lagMs = (f.lags[portal] ?? 0) * 1000;
  const phase = ((((tMs - lagMs) % periodMs) + periodMs) % periodMs) / periodMs;
  return Math.min(f.frames - 1, Math.floor(phase * f.frames));
}
