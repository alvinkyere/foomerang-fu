import { randomFrom } from './deathMotion';

/**
 * How a killed character comes apart, as every death in both HQs shows it (art/physics_reference/README.md, "Every death in both
 * HQs"): cut level a little above its middle; the top flies off along the hit, comes down and slides to a stop turning; the bottom
 * stays standing; goo in the body's own hue bursts from the cut, spreads, falls and is gone by ≈ 1.45 s; the eyes become X's at
 * ≈ 0.7 s. Pure and seeded so a replay looks the same. Lengths are in the character's widths (W, taken as its height: the HQs'
 * characters are about as wide as tall); ground axes x and z, y up.
 */
export const CUT = Object.freeze({
  /** Where the cut runs: this fraction of the height up from the feet (the eggplant at HQ1 2:03.0 and 3:19.3). */
  height: 0.57,
  /** The top's flight, from the cut until it is down on the ground (s; read frame by frame at 3:19.3). */
  flight: 0.35,
  /** How high the top rises over the cut before it falls (W; by eye at 3:19.3: it lifts clear of the bottom). */
  rise: 0.25,
  /** How far the top goes in all (W): the eggplant at 3:19.3, 0.9 W in ≈ 1.2 s; the donut at 1:03, 2.6 W in ≈ 2.3 s. */
  near: { distance: 0.9, seconds: 1.2 },
  far: { distance: 2.6, seconds: 2.3 },
  /** An explosion flings the pieces several times as far (HQ1 4:14.3, 6:33.6: read by eye). */
  blown: 3,
});

/** The eyes become black X's this long after the hit (3:19.99 on the eggplant hit at 3:19.28). */
export const DEAD_EYES_AT = 0.7;

export interface Top {
  readonly direction: { readonly x: number; readonly z: number };
  readonly distance: number;
  readonly seconds: number;
  readonly turn: number;
  readonly tip: number;
}

export interface TopPose {
  /** From where it was on the body: along the ground, and up (it ends the cut's height down, on the ground). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Its turn about the vertical, and its tip over (radians) so far. */
  readonly turn: number;
  readonly tip: number;
  readonly resting: boolean;
}

/** The top of a character cut by a hit going `hit` (undefined: no direction, it goes off across the view). */
export function topFor(
  hit: { readonly x: number; readonly z: number } | undefined,
  seed: string,
  blown: boolean,
): Top {
  const random = randomFrom(`${seed}:top`);
  const len = hit === undefined ? 0 : Math.hypot(hit.x, hit.z);
  const n = hit === undefined || len === 0 ? { x: 1, z: 0 } : { x: hit.x / len, z: hit.z / len };
  const wobble = (random() - 0.5) * 0.5; // a little play in the angle, as the HQs' tops do not leave exactly along the line
  const direction = {
    x: n.x * Math.cos(wobble) - n.z * Math.sin(wobble),
    z: n.x * Math.sin(wobble) + n.z * Math.cos(wobble),
  };
  const k = random();
  const distance = CUT.near.distance + (CUT.far.distance - CUT.near.distance) * k;
  const seconds = CUT.near.seconds + (CUT.far.seconds - CUT.near.seconds) * k;
  const sign = random() < 0.5 ? -1 : 1;
  return {
    direction,
    distance: blown ? distance * CUT.blown : distance,
    seconds: blown ? seconds * Math.sqrt(CUT.blown) : seconds,
    turn: sign * (Math.PI / 2) * (0.8 + 0.4 * random()),
    tip: (Math.PI / 2) * (0.3 + 0.4 * random()),
  };
}

/** The top `t` seconds after the hit: a constant deceleration along the ground to a stop; up off the cut and down in `flight`. */
export function topAt(top: Top, t: number): TopPose {
  const s = Math.min(Math.max(0, t), top.seconds);
  const v0 = (2 * top.distance) / top.seconds;
  const decel = v0 / top.seconds;
  const along = v0 * s - (decel * s * s) / 2;
  const k = along / top.distance;
  // up and down: rising `rise` over the cut, landing the cut's height below where it started at `flight`
  const T = CUT.flight;
  const H = CUT.rise;
  const h = CUT.height;
  const root = (Math.sqrt(2 * H) * T + Math.sqrt(2 * H * T * T + 2 * T * T * h)) / (T * T);
  const g = root * root;
  const up = Math.sqrt(2 * g * H);
  const f = Math.min(Math.max(0, t), T);
  const y = t >= T ? -h : up * f - (g * f * f) / 2;
  return {
    x: top.direction.x * along,
    y,
    z: top.direction.z * along,
    turn: top.turn * k,
    tip: top.tip * Math.min(1, Math.max(0, t) / T),
    resting: t >= top.seconds,
  };
}

// --- the goo ---------------------------------------------------------------------------------------------------------------

/**
 * The goo (3:19.3, measure_cut.py): up to ≈ 22 blobs; a joined splash out of the cut first (≈ 0.18 W at 0.25–0.35 s), then round
 * blobs ≈ 0.09 W spreading out (median ≈ 1 W, at most ≈ 2 W) and falling to the ground; shrinking away from ≈ 1.15 s, gone by 1.45 s.
 */
export const GOO = Object.freeze({
  count: 22,
  splash: { size: 0.18, until: 0.35, joined: 0.6 },
  size: 0.09,
  reach: { least: 0.4, most: 2.0 },
  land: { first: 0.5, last: 0.9 },
  gravity: 6,
  shrink: { from: 1.15, goneBy: 1.45 },
});

export interface Goo {
  readonly angle: number;
  readonly reach: number;
  readonly land: number;
  readonly size: number;
}

export function gooFor(
  hit: { readonly x: number; readonly z: number } | undefined,
  seed: string,
): Goo[] {
  const random = randomFrom(`${seed}:goo`);
  const along = hit === undefined ? 0 : Math.atan2(hit.z, hit.x);
  return Array.from({ length: GOO.count }, (_, i) => {
    const u = random();
    return {
      angle: along + (i / GOO.count) * Math.PI * 2 + (random() - 0.5) * 0.5,
      reach: GOO.reach.least + (GOO.reach.most - GOO.reach.least) * u ** 1.3,
      land: GOO.land.first + (GOO.land.last - GOO.land.first) * random(),
      size: GOO.size * (0.7 + 0.6 * random()),
    };
  });
}

/** A blob `t` seconds after the hit: where it is (from the feet, y above the ground) and how big (its radius, W; 0 = gone). */
export function gooAt(b: Goo, t: number): { x: number; y: number; z: number; size: number } {
  const s = Math.max(0, t);
  const k = Math.min(1, s / b.land);
  const r = b.reach * (1 - (1 - k) * (1 - k));
  const up = (GOO.gravity * b.land * b.land) / 2 - CUT.height;
  const f = Math.min(s, b.land);
  const y = s >= b.land ? 0 : CUT.height + (up / b.land) * f - (GOO.gravity * f * f) / 2;
  // big and joined as it leaves the cut, settling to its own size; then shrinking away
  const grow = Math.min(1, s / 0.05);
  const splash =
    s <= GOO.splash.until
      ? GOO.splash.size / GOO.size
      : s >= GOO.splash.joined
        ? 1
        : GOO.splash.size / GOO.size +
          (1 - GOO.splash.size / GOO.size) *
            ((s - GOO.splash.until) / (GOO.splash.joined - GOO.splash.until));
  const fade =
    s >= GOO.shrink.goneBy
      ? 0
      : s <= GOO.shrink.from
        ? 1
        : 1 - (s - GOO.shrink.from) / (GOO.shrink.goneBy - GOO.shrink.from);
  return {
    x: Math.cos(b.angle) * r,
    y: Math.max(0, y),
    z: Math.sin(b.angle) * r,
    size: b.size * grow * splash * fade,
  };
}

/** The goo's colour: the body's own hue and saturation at full brightness (value 0.96), 0–255. */
export function gooColour(body: string): [number, number, number] {
  const n = Number.parseInt(body.replace('#', ''), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const max = Math.max(...rgb);
  if (max === 0) return [245, 245, 245];
  const k = (0.96 * 255) / max;
  return rgb.map((c) => Math.round(c * k)) as [number, number, number];
}

/**
 * Each character's goo as its kills in the HQs show it (goocol.py: the colours that appear round the cut by +0.45 s): the toast's
 * is brown crumbs, the milk carton's blue, the mint ice lolly's teal. The carrot, the avocado and the watermelon die in neither HQ:
 * theirs is derived from their colour (`gooColour`).
 */
export const GOO_COLOUR: Readonly<Record<string, string>> = {
  bread: '#9e8050',
  banana: '#e6d644',
  donut: '#e87198',
  coffee: '#573d2f',
  bacon: '#c87c5f',
  icecream: '#61d3bd',
  milk: '#83aeeb',
};

export function gooColourOf(kind: string | undefined, colour: string): [number, number, number] {
  const measured = kind === undefined ? undefined : GOO_COLOUR[kind];
  if (measured === undefined) return gooColour(colour);
  const n = Number.parseInt(measured.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
