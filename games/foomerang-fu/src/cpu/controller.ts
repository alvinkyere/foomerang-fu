import { zoneOf } from '../rules/battleRoyale';
import { FIXED_TIMESTEP_SECONDS as DT, type Vec2 } from '@foomerang/game-core';
import {
  breakablesOf,
  fencesOf,
  circleHitsWalls,
  lineClearTo,
  lineIsClear,
  onGround,
  turntableUnder,
  pushOutOfSolid,
  sweepCircle,
  wallsOf,
  type Rect,
  type Solid,
} from '../rules/arena';
import { fromBorderFrame, inBorderFrame, type TurnedBox } from '../rules/arena';
import type { FuPlayerInput } from '../rules/step';
import type { FuState } from '../rules/state';
import { gatesOf, inRect, systemsView, type SystemsView } from '../rules/systems';
import { LEAP_MARGIN, cellInRect, navGridFor } from './nav';
import { PROFILES, type Difficulty, type Profile } from './profile';
import { Rng } from './rng';

/**
 * A CPU is a player whose controller happens to be software. This file turns what a CPU can LEGALLY
 * PERCEIVE into the same ordinary inputs a human's phone produces (a thumb direction and the SLASH,
 * THROW and DASH buttons). It never touches the state: the rules decide whether anything it asks for works.
 *
 * What it may know — and nothing else:
 *   - its own body, exactly, as a person feels it (position, facing, swing, dash, fatigue, what it owns);
 *   - the world as it was `reaction` ticks ago (a deterministic delay, longer on Easy): where the others
 *     were, which boomerangs were flying and how, which Books lay about, the state of the arena's gates,
 *     platforms and floor as telegraphed;
 *   - velocities inferred from two such observations (never read);
 *   - never: anyone's pending input, a Book's future award, the seed, the spawn clock, or the future.
 */

const MAX_HISTORY = 80;
/** Close enough to a waiting place to stop there (a nav cell). */
const CELL_NEAR = 25;

/** A second boomerang may follow the first this soon (ticks): with two, the video's players throw them in quick succession. */
const FOLLOW_UP_TICKS = 30;

interface FoeView {
  readonly id: string;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly weapons: number;
  readonly weaponsAway: number;
  readonly slashActive: boolean;
  readonly dashing: boolean;
}
interface ShotView {
  readonly key: string;
  readonly ownerId: string;
  readonly state: 'THROWN' | 'RETURNING' | 'DEFLECTED';
  readonly position: Vec2;
  readonly direction: Vec2;
  readonly deflectedBy: string | undefined;
}
interface Observation {
  readonly foes: readonly FoeView[];
  readonly shots: readonly ShotView[];
  readonly books: readonly Vec2[];
  readonly systems: SystemsView;
  /** Walls as they stood (static walls and gates that had shut). */
  readonly solids: readonly Solid[];
}

const norm = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const rotate = (v: Vec2, a: number): Vec2 => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});
/** A quick throw's path: an arc of curvature `kappa` from `from` along `dir`, swept in short chords against `solids`. */
function sweepArc(
  from: Vec2,
  dir: Vec2,
  length: number,
  kappa: number,
  config: FuState['config'],
  solids: readonly Solid[],
): { readonly position: Vec2; readonly blocked: boolean; readonly flown: number } {
  const pieces = 12;
  let at = from;
  let heading = dir;
  for (let i = 0; i < pieces; i += 1) {
    const l = length / pieces;
    const turn = kappa * l;
    const chord = turn > 1e-12 ? (2 * Math.sin(turn / 2)) / kappa : l;
    const along = rotate(heading, turn / 2);
    const next = { x: at.x + along.x * chord, y: at.y + along.y * chord };
    const swept = sweepCircle(at, next, config.boomerangRadius, solids);
    if (swept.blocked)
      return { position: swept.position, blocked: true, flown: (i * length) / pieces };
    at = next;
    heading = rotate(heading, turn);
  }
  return { position: at, blocked: false, flown: length };
}

const positionOf = (s: FuState, id: string): Vec2 =>
  s.world.bodies.find((b) => b.id === id)?.position ?? { x: 0, y: 0 };

function observe(past: FuState, earlier: FuState, selfId: string): Observation {
  const gates = gatesOf(past.config.arena);
  const systems = systemsView(past.config.arena, past.roundTime, past.gatesShut);
  const solids: Solid[] = [
    ...wallsOf(past.config.arena),
    ...breakablesOf(past.config.arena).filter((b) => !past.broken.includes(b.id)),
  ];
  gates.forEach((g, k) => {
    if (past.gatesShut[k] === true) solids.push(g.rect);
  });
  const gap = Math.max(DT, past.elapsed - earlier.elapsed);
  const weaponsOf = (s: FuState, id: string) =>
    [...s.boomerangs, ...s.extraBoomerangs].filter((b) => b.ownerId === id);
  const foes: FoeView[] = past.players.flatMap((p): FoeView[] => {
    if (p.id === selfId || !p.alive) return [];
    // TEAM UP: a teammate is no foe (nothing of theirs hurts it, nothing of its hurts them)
    const side = past.config.teams?.[selfId];
    if (side !== undefined && past.config.teams?.[p.id] === side) return [];
    const now = positionOf(past, p.id);
    const before = positionOf(earlier, p.id);
    const mine = weaponsOf(past, p.id);
    return [
      {
        id: p.id,
        position: now,
        velocity: { x: (now.x - before.x) / gap, y: (now.y - before.y) / gap },
        weapons: mine.length,
        weaponsAway: mine.filter((w) => w.state !== 'HELD').length,
        slashActive: p.slash.phase === 'ACTIVE',
        dashing: p.dash.phase === 'DASHING',
      },
    ];
  });
  const count = new Map<string, number>();
  const shots: ShotView[] = [...past.boomerangs, ...past.extraBoomerangs].flatMap(
    (b): ShotView[] => {
      const n = count.get(b.ownerId) ?? 0;
      count.set(b.ownerId, n + 1);
      // a boomerang lying on the ground, or destroyed by its blast, is no threat (one pulled home is, and flies like any other)
      if (
        b.state === 'HELD' ||
        b.state === 'GROUNDED' ||
        b.state === 'SPENT' ||
        b.ownerId === selfId
      )
        return [];
      return [
        {
          key: `${b.ownerId}:${n}`,
          ownerId: b.ownerId,
          state: b.state === 'RECALLING' ? 'RETURNING' : b.state,
          position: b.position,
          direction: b.direction,
          deflectedBy: b.deflectedBy,
        },
      ];
    },
  );
  return { foes, shots, books: past.pickups.map((p) => p.position), systems, solids };
}

/**
 * The lever of the pen `here` is walled in by, while its walls stand (the warm-up: four `drops` sliders a pen, in a row, sharing one lever;
 * the pen the rectangle its two long walls and two short walls enclose), or undefined.
 */
export function penLever(state: FuState, here: Vec2): Vec2 | undefined {
  return penOf(state, here)?.lever;
}

/** The pen `here` is walled in by (penLever), with the way along its length towards the lever (the pens cross the water at right angles). */
export function penOf(state: FuState, here: Vec2): { lever: Vec2; along: Vec2 } | undefined {
  const specs = state.config.arena.sliders ?? [];
  for (let k = 0; k + 3 < specs.length; k += 4) {
    const group = specs.slice(k, k + 4);
    if (!group.every((g) => g.drops === true)) continue;
    if ((state.sliders?.[k]?.progress ?? 0) >= 1) continue; // (open)
    const [a, b, c] = group.map((g) => g.wall) as [TurnedBox, TurnedBox, TurnedBox];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const cs = Math.cos(-a.angle);
    const sn = Math.sin(-a.angle);
    const dx = here.x - mx;
    const dy = here.y - my;
    if (Math.abs(dx * cs - dy * sn) <= a.halfWidth && Math.abs(dx * sn + dy * cs) <= c.halfHeight) {
      const l = group[0]?.levers[0];
      if (l !== undefined) {
        const ax = { x: Math.cos(a.angle), y: Math.sin(a.angle) };
        const sign = (l.x - here.x) * ax.x + (l.y - here.y) * ax.y >= 0 ? 1 : -1;
        return { lever: { x: l.x, y: l.y }, along: { x: ax.x * sign, y: ax.y * sign } };
      }
    }
  }
  return undefined;
}

export class CpuController {
  readonly #id: string;
  readonly #profile: Profile;
  /** The arena's border (its safe zone), read from the state each decision. */
  #zone: Rect | undefined;
  readonly #rng: Rng;
  readonly #delay: number;
  readonly #phase: number;
  readonly #history: FuState[] = [];
  #tick = 0;
  /** The round it is watching: a new round is a new world, with nothing yet seen of it. */
  #round = -1;
  #move: Vec2 = { x: 0, y: 0 };
  #target: string | undefined;
  #targetUntil = 0;
  #wander = 0;
  #intent: { until: number } | undefined;
  #lastThrow = -9999;
  #lastDash = -9999;
  #pendingSlash: { at: number; aim: Vec2 } | undefined;
  #dodge: { until: number; dir: Vec2 } | undefined;
  /** Which way it drifts while it holds its distance (+1 / −1); it changes its mind now and then. */
  #side = 1;
  /** When it last changed the side it drifts to (a drift lasts a while: flipping every few ticks read as jitter). */
  #sideSince = 0;
  /** A planned dash over water (nav.ts dash links): the point it means to land on, set by #goTo while that is the way. */
  #leap: Vec2 | undefined;
  /** The leap out of a pen: a landing with its middle well on ground will do (a player falls only when its middle leaves it). */
  #leapLoose = false;
  #leapSince = -9999;
  /** Its heading is a step of its plan (nav.ts: a free cell or a dash's launch), not a stale or a free-styled one. */
  #onPlan = false;
  /** Which branch of its thinking set its heading last (for checks of its behaviour; it changes nothing). */
  why = '';
  #planned: Vec2 = { x: 0, y: 0 };
  #plannedAt = -9999;
  /** The way it last turned along an edge (keeps turning that way: one turn this way and the next that way was a jitter). */
  #edgeTurn = 1;
  readonly #decided = new Set<string>();
  readonly #grudge = new Map<string, number>();
  #field: { key: string; at: number; data: Int16Array } | undefined;
  /** Where it last decided to fight its opponent from (#approach), and for which of their cells. */
  #post: { key: string; at: number; spot: Vec2 } | undefined;
  /** Counters for evaluation only; nothing reads them to decide. */
  readonly stats = {
    deflectTries: 0,
    dodges: 0,
    dashes: 0,
    throws: 0,
    slashes: 0,
    lapses: 0,
    threats: 0,
  };

  readonly difficulty: Difficulty;

  /** `profile` replaces the difficulty's own table (evaluation only: it lets a study change one dimension at a time). */
  constructor(
    id: string,
    difficulty: Difficulty,
    seed: number,
    profile: Profile = PROFILES[difficulty],
  ) {
    this.#id = id;
    this.difficulty = difficulty;
    this.#profile = profile;
    this.#rng = new Rng(seed);
    const [lo, hi] = this.#profile.reactionTicks;
    this.#delay = Math.round(this.#rng.range(lo, hi)); // one fixed reaction time per CPU
    this.#phase = Math.floor(this.#rng.range(0, this.#profile.decisionTicks)); // so a table of CPUs do not all think on one tick
  }

  get reactionTicks(): number {
    return this.#delay;
  }

  /** Called once per simulation step with the state the step is about to run on. Returns this step's input. */
  decide(state: FuState): FuPlayerInput {
    if (state.round !== this.#round) {
      this.#round = state.round;
      this.#history.length = 0;
      this.#pendingSlash = undefined;
      this.#dodge = undefined;
      this.#target = undefined;
      this.#field = undefined;
      this.#post = undefined;
      this.#wander = 0;
      this.#intent = undefined;
      this.#decided.clear();
      this.#move = { x: 0, y: 0 };
    }
    this.#history.push(state);
    if (this.#history.length > MAX_HISTORY) this.#history.shift();
    this.#tick += 1;
    const me = state.players.find((p) => p.id === this.#id);
    if (me === undefined || !me.alive || state.phase !== 'PLAYING') {
      this.#move = { x: 0, y: 0 };
      return {};
    }
    // it has seen nothing of this round yet: it stands and looks until it has a full reaction-window of observations
    if (this.#history.length < this.#delay + 6) return { move: { x: 0, y: 0 } };
    const out: { throw?: true; slash?: true; dash?: true } = {};
    let aimOverride: Vec2 | undefined;

    // a timed deflection it already decided to try
    const pending = this.#pendingSlash;
    if (pending !== undefined && this.#tick >= pending.at) {
      this.#pendingSlash = undefined;
      if (this.#canSlash(state)) {
        out.slash = true;
        aimOverride = pending.aim;
        this.stats.slashes += 1;
      }
    }

    if ((this.#tick + this.#phase) % this.#profile.decisionTicks === 0 && out.slash === undefined) {
      const lastIndex = this.#history.length - 1;
      const past = this.#history[Math.max(0, lastIndex - this.#delay)] as FuState;
      const earlier = this.#history[Math.max(0, lastIndex - this.#delay - 4)] as FuState;
      this.#think(state, observe(past, earlier, this.#id), out);
      if (out.dash === true) this.#lastDash = this.#tick;
    }
    let dir = aimOverride ?? this.#move;
    // never over an edge (falling kills; the ground as it is now: a turntable turns): a heading that would carry it off the ground turns along the edge instead (the
    // nearest turn that keeps it on: round a bridge's end it would otherwise stop dead), or stops; a dash that would is dropped
    const arena = state.config.arena;
    const body = state.world.bodies.find((b) => b.id === this.#id);
    if (arena.ground !== undefined && body !== undefined) {
      const here = body.position;
      const off = (d: Vec2, reach: number): boolean =>
        !onGround({ x: here.x + d.x * reach, y: here.y + d.y * reach }, arena, state.roundTime);
      const r = state.config.playerRadius;
      // every few units out to two radii (one sample far ahead would step across a corner where a bridge meets an island);
      // from half a radius out each sample must also have ground a margin round it, so it never walks along an edge with its
      // middle on it (a shove or a slide along a wall would tip it over)
      const margin = 12;
      const offNear = (d: Vec2, reach: number): boolean =>
        [0, 1, 2, 3, 4, 5, 6, 7].some((k) =>
          off(
            {
              x: d.x * reach + Math.cos((k * Math.PI) / 4) * margin,
              y: d.y * reach + Math.sin((k * Math.PI) / 4) * margin,
            },
            1,
          ),
        );
      // and where walking that way really takes it: into a pot or a block it slides round it, and the slide can carry it over
      // an edge its heading never pointed at (the gong islands' south island: the aloe by its west edge)
      const solids = [
        ...wallsOf(arena),
        ...fencesOf(arena),
        ...breakablesOf(arena).filter((b) => !state.broken.includes(b.id)),
      ];
      const stride = state.config.playerSpeed * DT;
      const slidesOff = (d: Vec2, strides = 12): boolean => {
        let x = here.x;
        let y = here.y;
        for (let i = 0; i < strides; i += 1) {
          x += d.x * stride;
          y += d.y * stride;
          for (const solid of solids) {
            const out = pushOutOfSolid(x, y, r, solid, 0);
            if (out !== undefined) [x, y] = out;
          }
          // its middle must stay on; from a few strides on, a margin round it too (one already at an edge can still leave it)
          const room = i < 3 ? 0 : margin;
          if (
            [0, 1, 2, 3, 4, 5, 6, 7].some(
              (k) =>
                !onGround(
                  {
                    x: x + Math.cos((k * Math.PI) / 4) * room,
                    y: y + Math.sin((k * Math.PI) / 4) * room,
                  },
                  arena,
                  state.roundTime,
                ),
            )
          )
            return true;
        }
        return false;
      };
      // (on its plan, whose cells keep a body's radius of ground all round, it only looks at its next steps: looking two radii ahead
      // near an edge always saw water and stopped it short of where its plan, or a dash, was taking it)
      const onPlan = this.#onPlan && dir.x * this.#planned.x + dir.y * this.#planned.y > 0.97;
      const unsafe = (d: Vec2): boolean =>
        [0.05, 0.1, 0.15, 0.2, 0.25].some((k) => off(d, k * r)) ||
        (!onPlan && [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].some((k) => offNear(d, k * r))) ||
        slidesOff(d, onPlan ? 3 : 12);
      // a planned dash over water (nav.ts): when it can dash at full length now and the dash lands it on ground all round, it goes;
      // until then it waits on the edge, still
      const leap = this.#leap;
      const me = state.players.find((q) => q.id === this.#id);
      if (leap !== undefined && me !== undefined && aimOverride === undefined) {
        const to = norm(sub(leap, here));
        const full = state.config.dashSpeed * state.config.dashSeconds;
        const lands = [0, 1, 2, 3, 4, 5, 6, 7].every((k) =>
          onGround(
            {
              x:
                here.x +
                to.x * full +
                Math.cos((k * Math.PI) / 4) * (this.#leapLoose ? r * 0.4 : r + LEAP_MARGIN),
              y:
                here.y +
                to.y * full +
                Math.sin((k * Math.PI) / 4) * (this.#leapLoose ? r * 0.4 : r + LEAP_MARGIN),
            },
            arena,
            state.roundTime,
          ),
        );
        const ready =
          me.dash.phase === 'READY' &&
          me.slash.phase === 'READY' &&
          me.fatigue.dashes < state.config.dashFreeCount &&
          !me.inventory.includes('CAFFEINATED');
        if (lands && ready) {
          out.dash = true;
          this.#lastDash = this.#tick;
          this.stats.dashes += 1;
          this.#leap = undefined;
          this.#leapSince = -9999;
          return this.#finish(to, out);
        }
        if (lands) {
          delete out.dash;
          return this.#finish({ x: 0, y: 0 }, out); // wait for the dash
        }
        // short of where a dash would land it: it steps up towards the edge (its middle never leaving the ground, with a few units
        // to spare) and tries again; at the edge and still short, it waits
        const stride = state.config.playerSpeed * DT;
        const step = { x: here.x + to.x * stride * 2, y: here.y + to.y * stride * 2 };
        const room = [0, 1, 2, 3, 4, 5, 6, 7].every((k) =>
          onGround(
            {
              x: step.x + Math.cos((k * Math.PI) / 4) * 6,
              y: step.y + Math.sin((k * Math.PI) / 4) * 6,
            },
            arena,
            state.roundTime,
          ),
        );
        delete out.dash;
        return this.#finish(room ? to : { x: 0, y: 0 }, out);
      }
      if (aimOverride === undefined && (dir.x !== 0 || dir.y !== 0) && unsafe(dir)) {
        const d = dir;
        const sign = this.#edgeTurn;
        const zone = this.#zone;
        const outside = zone !== undefined && !inRect(inBorderFrame(arena, here), zone);
        const turned = (outside ? [30, -30, 60, -60, 90, -90] : [20, -20, 35, -35])
          .map((a) => a * sign) // (outside the border it must get back in, round whatever: every turn) // (a small turn round a corner; anything more and it stops: its plan never points it at the water, so a heading that does is stale, and sliding along the edge on it was a back-and-forth)
          .map((deg) => (deg * Math.PI) / 180)
          .map((a) => ({
            x: d.x * Math.cos(a) - d.y * Math.sin(a),
            y: d.x * Math.sin(a) + d.y * Math.cos(a),
          }))
          .find((t) => !unsafe(t));
        // it keeps turning the way it last turned (not this way one tick and that way the next)
        if (turned !== undefined) this.#edgeTurn = d.x * turned.y - d.y * turned.x >= 0 ? 1 : -1;
        dir = turned ?? { x: 0, y: 0 };
      }
      const dashReach = state.config.dashSpeed * state.config.dashSeconds + r;
      if (
        out.dash === true &&
        [0.25, 0.5, 0.75, 1].some((k) => off(dir, dashReach * k) || (dir.x === 0 && dir.y === 0))
      )
        delete out.dash;
    }
    return this.#finish(dir, out);
  }

  /** The input it hands the rules: its heading, its actions, and THROW held while it pulls a dropped boomerang home. */
  #finish(dir: Vec2, out: { throw?: true; slash?: true; dash?: true }): FuPlayerInput {
    const state = this.#history[this.#history.length - 1] as FuState;
    // its boomerang dropped (it lies on the ground, or is being pulled home): hold THROW and pull it home, as a player can.
    // Calling means standing still (the calling pose), so not while it is dodging something.
    const dodging = this.#dodge !== undefined && this.#tick < this.#dodge.until;
    const away =
      !dodging &&
      [...state.boomerangs, ...state.extraBoomerangs].some(
        (b) => b.ownerId === this.#id && (b.state === 'GROUNDED' || b.state === 'RECALLING'),
      );
    const input: { move: Vec2; throw?: true; throwHeld?: true; slash?: true; dash?: true } = {
      move: dir,
      ...out,
      ...(away ? { throwHeld: true as const } : {}),
    };
    return input;
  }

  #canSlash(state: FuState): boolean {
    const me = state.players.find((p) => p.id === this.#id);
    if (me === undefined) return false;
    const mine = [...state.boomerangs, ...state.extraBoomerangs].filter(
      (b) => b.ownerId === this.#id,
    );
    return (
      me.slash.phase === 'READY' &&
      me.dash.phase !== 'DASHING' &&
      mine.some((b) => b.state === 'HELD')
    );
  }

  #think(
    state: FuState,
    view: Observation,
    out: { throw?: true; slash?: true; dash?: true },
  ): void {
    const p = this.#profile;
    const { config } = state;
    const me = state.players.find((q) => q.id === this.#id);
    if (me === undefined) return;
    // a dash it has chosen it keeps to for a while (choosing again every few ticks walked it up and down the edge between two launches)
    if (this.#tick - this.#leapSince > 240) this.#leap = undefined;
    this.#onPlan = false;
    const here = positionOf(state, this.#id);
    const mine = [...state.boomerangs, ...state.extraBoomerangs].filter(
      (b) => b.ownerId === this.#id,
    );
    const heldCount = mine.filter((b) => b.state === 'HELD').length;
    const throwReady =
      heldCount > 0 && // a throw throws one (EXTRA_BOOMERANG's second can go while the first is out)
      me.slash.phase !== 'ACTIVE' &&
      me.dash.phase !== 'DASHING';
    const slashReady = this.#canSlash(state);
    const dashReady = me.dash.phase === 'READY' && me.slash.phase === 'READY';
    const fatigued = me.fatigue.dashes > config.dashFreeCount;
    const dashAllowed =
      dashReady && (!p.fatigueAware || me.fatigue.dashes < config.dashFreeCount - 1);

    // lapses: it sometimes simply does not think this time (Easy also wanders off for a moment)
    if (this.#wander > 0) {
      this.#wander -= p.decisionTicks;
    } else if (this.#rng.chance(p.lapse)) {
      this.stats.lapses += 1;
      if (p.lapse > 0.1) {
        this.#wander = 18;
        this.#move = rotate({ x: 1, y: 0 }, this.#rng.range(0, Math.PI * 2));
      }
      if (this.#wander <= 0) return;
    }

    const onPlatform = view.systems.platforms.some((pl) => inRect(here, pl.rect));

    // 0. the border: outside the safe zone a player explodes, so a CPU that finds itself out there heads straight back in
    const zone = zoneOf(state); // (Battle Royale: the border as it has closed in)
    this.#zone = zone;
    const local = inBorderFrame(state.config.arena, here); // (a turned border: the warm-up's)
    if (zone !== undefined && !inRect(local, zone)) {
      const margin = state.config.playerRadius + 30;
      const to = fromBorderFrame(state.config.arena, {
        x: Math.min(Math.max(local.x, zone.x + margin), zone.x + zone.width - margin),
        y: Math.min(Math.max(local.y, zone.y + margin), zone.y + zone.height - margin),
      });
      // round what is in the way (a stall in a corner would stop a straight line home until it explodes)
      this.#goTo(to, state, view, here);
      return;
    }

    // 0b. walled in a pen (the warm-up: sliders.ts `drops`): get to its lever, across the water at the pen's far end, and strike it
    const pen = penOf(state, here);
    const lever = pen?.lever;
    if (pen !== undefined && lever !== undefined) {
      if (slashReady && dist(here, lever) < config.slashReach * 0.8) {
        out.slash = true;
        this.stats.slashes += 1;
        this.#move = norm(sub(lever, here));
        this.#leap = undefined; // (facing the lever as it strikes, not the leap it was waiting on)
        this.why = 'pen';
        return;
      }
      // (straight at it: inside the pen the line is clear, the planner knows nothing of the pen's walls; at the water's edge, a dash
      // that lands on the far side)
      const dir = norm(sub(lever, here));
      this.#move = dir;
      const leap = config.dashSpeed * config.dashSeconds;
      const at = (d: number): Vec2 => ({ x: here.x + dir.x * d, y: here.y + dir.y * d });
      if (
        [1.6, 2.5, 3.5].some(
          (k) => !onGround(at(config.playerRadius * k), state.config.arena, state.roundTime),
        )
      ) {
        // (the water between: a planned leap straight along the pen, across the water at its narrowest, which steps up to the edge
        // and goes when the landing is safe)
        this.#leap = { x: here.x + pen.along.x * leap, y: here.y + pen.along.y * leap };
        this.#leapLoose = true;
        this.#leapSince = this.#tick;
      }
      this.why = 'pen';
      return;
    }

    // 1. the floor: get off danger it can see (Easy only reacts once it is ACTIVE; the others on WARNING)
    for (const h of view.systems.hazards) {
      const danger =
        h.phase === 'ACTIVE' ||
        (h.phase === 'WARNING' && p.hazardLookahead > 0) ||
        (h.phase === 'SAFE' && h.secondsToChange < p.hazardLookahead - 1);
      if (danger && inRect(here, h.rect) && !onPlatform) {
        this.#move = this.#exitFrom(h.rect, here, state);
        this.why = 'hazard';
        return;
      }
    }

    // 2. incoming boomerangs: deflect, dodge or ignore, depending on skill
    const threatened = this.#handleShots(state, view, here, {
      slashReady,
      dashAllowed,
      mine: heldCount,
    });
    if (threatened === 'DASH') {
      out.dash = true;
      this.stats.dashes += 1;
      return;
    }
    if (this.#dodge !== undefined && this.#tick < this.#dodge.until) {
      this.#move = this.#dodge.dir;
      this.why = 'dodge';
      return;
    }

    // 3. who to fight
    const foe = this.#chooseTarget(state, view, here, heldCount === 0);
    const bold = me.inventory.includes('SHIELD'); // a shield makes it press a little harder
    // 4. what to fetch (a Book is a mystery: it never knows what it will get)
    const book = this.#chooseBook(view, here, foe);

    // a Book is a lasting upgrade: unless a fight is right on top of it, it goes to fetch one
    if (book !== undefined && (foe === undefined || dist(here, foe.position) > 330)) {
      const before = this.#move;
      this.why = 'book';
      this.#goTo(book, state, view, here);
      this.#settle(before, view, here);
      this.#maybeDash(out, state, view, here, book, me, dashAllowed, fatigued);
      return;
    }

    if (foe !== undefined) {
      const d = dist(here, foe.position);
      const los = lineIsClear(here, foe.position, view.solids);
      // melee
      if (
        slashReady &&
        los &&
        d < config.slashReach * (bold ? 1.0 : 0.9) &&
        this.#rng.chance(p.slashEager)
      ) {
        out.slash = true;
        this.stats.slashes += 1;
        this.#move = norm(sub(foe.position, here));
        this.#intent = undefined; // a strike ends whatever it was walking toward
        return;
      }
      // ranged
      if (
        throwReady &&
        d <= (config.throwRange + 40) * p.throwReach &&
        // the gap paces its throws; a follow-up while one is already out (EXTRA_BOOMERANG) goes after a short beat
        this.#tick - this.#lastThrow >= (heldCount < mine.length ? FOLLOW_UP_TICKS : p.throwGap) &&
        !this.#rng.chance(p.throwHold) // it does not always take the shot it has
      ) {
        const shot = this.#aim(state, view, here, foe);
        if (shot !== undefined) {
          out.throw = true;
          this.stats.throws += 1;
          this.#lastThrow = this.#tick;
          this.#move = { x: shot.x * 0.3, y: shot.y * 0.3 };
          this.#intent = undefined;
          return;
        }
      }
      // pressure: an opponent with nothing in hand is there to be hunted
      const hunted = p.pressure && foe.weaponsAway === foe.weapons && foe.weapons > 0;
      // when its own weapons are away and an armed foe is near, get out of sight
      if (p.cover && heldCount === 0 && !hunted && d < 420) {
        const before = this.#move;
        this.#move = this.#coverFrom(foe.position, here, state, view);
        this.#settle(before, view, here);
        this.why = 'cover';
        return;
      }
      if (book !== undefined && !hunted) {
        const before = this.#move;
        this.#goTo(book, state, view, here);
        this.#settle(before, view, here);
        this.#maybeDash(out, state, view, here, book, me, dashAllowed, fatigued);
        return;
      }
      const keepAway = throwReady && !hunted && !bold;
      const stand = keepAway ? config.throwRange * p.standOff : config.slashReach * 0.6;
      // too near with a boomerang in hand: back off to its throwing distance, as the video's players keep theirs
      // away from everyone too near at once (backing off from one must not walk it into another); sandwiched, it drifts
      const push = view.foes
        .filter((f) => dist(here, f.position) < stand * 0.8)
        .reduce(
          (sum, f) => {
            const u = norm(sub(here, f.position));
            return { x: sum.x + u.x, y: sum.y + u.y };
          },
          { x: 0, y: 0 },
        );
      const away = Math.hypot(push.x, push.y) > 0.5 ? norm(push) : undefined;
      if (
        keepAway &&
        los &&
        d < stand * 0.8 &&
        away !== undefined &&
        !this.#walksIntoDanger(away, here, view)
      ) {
        const before = this.#move;
        this.#move = away;
        this.#settle(before, view, here);
        this.why = 'keepAway';
        return;
      }
      if (d > stand || !los) {
        const before = this.#move;
        this.#goTo(this.#approach(foe.position, state, view, here), state, view, here);
        this.#settle(before, view, here);
        this.why = 'approach';
        // never a committed dash down an armed opponent's line of fire
        const loaded = los && foe.weapons > foe.weaponsAway;
        if (!loaded)
          this.#maybeDash(out, state, view, here, foe.position, me, dashAllowed, fatigued);
      } else {
        // at its distance it keeps moving, sideways to the line between them (a still target is an easy one)
        const before = this.#move;
        if (this.#tick - this.#sideSince > 120 && this.#rng.chance(0.15)) {
          this.#side = -this.#side;
          this.#sideSince = this.#tick;
        }
        const across = norm(sub(foe.position, here));
        const drift = (side: number): Vec2 => ({ x: -across.y * side, y: across.x * side });
        // never drifting into a floor it knows to be deadly: the other way, or not at all; between two, it holds still
        // (and never drifting on out of the border's safe zone, a long drift would carry it out)
        const outward = (side: number): boolean => {
          const z = this.#zone;
          if (z === undefined) return false;
          const d = drift(side);
          return !this.#inZone({ x: here.x + d.x * 160, y: here.y + d.y * 160 }, z);
        };
        if (this.#walksIntoDanger(drift(this.#side), here, view) || outward(this.#side)) {
          this.#side = -this.#side;
          this.#sideSince = this.#tick;
        }
        const near = view.foes.filter((f) => dist(here, f.position) < stand).length;
        this.#move =
          near > 1 || this.#walksIntoDanger(drift(this.#side), here, view)
            ? { x: 0, y: 0 }
            : drift(this.#side);
        this.#settle(before, view, here);
        this.why = 'strafe';
      }
      return;
    }
    if (book !== undefined) {
      const before = this.#move;
      this.#goTo(book, state, view, here);
      this.#settle(before, view, here);
      return;
    }
    this.#move = { x: 0, y: 0 };
  }

  /**
   * DECISION COMMITMENT. `#move` now holds the heading it has just worked out and `previous` the one it was following.
   * While a commitment lasts it keeps `previous`; when it has lapsed it adopts the new heading (a little off the best
   * route, by the profile's `routeNoise`) and commits to it — or, now and then, stops to look instead (a hesitation).
   * Danger it has noticed, and a chance to strike, never reach here: they interrupt a commitment.
   */
  #settle(previous: Vec2, view: Observation, here: Vec2): void {
    const p = this.#profile;
    if (this.#intent !== undefined && this.#tick < this.#intent.until) {
      // it keeps its heading — unless that heading now walks it into the floor it knows to be deadly
      if (!this.#walksIntoDanger(previous, here, view)) {
        this.#move = previous;
        return;
      }
      this.#intent = undefined;
    }
    if (this.#rng.chance(p.hesitate)) {
      this.#intent = {
        until: this.#tick + Math.round(this.#rng.range(p.hesitateTicks[0], p.hesitateTicks[1])),
      };
      this.#move = { x: 0, y: 0 };
      return;
    }
    this.#intent = {
      until: this.#tick + Math.round(this.#rng.range(p.commitTicks[0], p.commitTicks[1])),
    };
    if (p.routeNoise > 0) {
      const sloppy = rotate(this.#move, this.#rng.range(-1, 1) * p.routeNoise);
      if (!this.#walksIntoDanger(sloppy, here, view)) this.#move = sloppy;
    }
  }

  /** Would walking along `heading` for the next third of a second put it on a hazard it considers dangerous? */
  /** Inside the border (turned, where the arena's is: the warm-up's). */
  #inZone(p: Vec2, zone: Rect): boolean {
    const state = this.#history[this.#history.length - 1];
    return inRect(state === undefined ? p : inBorderFrame(state.config.arena, p), zone);
  }

  #walksIntoDanger(heading: Vec2, here: Vec2, view: Observation): boolean {
    const p = this.#profile;
    const zone = this.#zone;
    if (zone !== undefined && this.#inZone(here, zone))
      for (const k of [0.15, 0.3]) {
        const reach = 420 * k;
        if (!this.#inZone({ x: here.x + heading.x * reach, y: here.y + heading.y * reach }, zone))
          return true;
      }
    for (const h of view.systems.hazards) {
      const danger =
        h.phase === 'ACTIVE' ||
        (h.phase === 'WARNING' && p.hazardLookahead > 0) ||
        (h.phase === 'SAFE' && h.secondsToChange < p.hazardLookahead - 1);
      if (!danger) continue;
      for (const k of [0.15, 0.3]) {
        const reach = 420 * k;
        if (inRect({ x: here.x + heading.x * reach, y: here.y + heading.y * reach }, h.rect))
          return true;
      }
    }
    return false;
  }

  /** The way off a hazard strip: out through the nearest edge, on to open floor. */
  #exitFrom(rect: Rect, here: Vec2, state: FuState): Vec2 {
    const margin = state.config.playerRadius + 6;
    const exits: Vec2[] = [
      { x: rect.x - margin, y: here.y },
      { x: rect.x + rect.width + margin, y: here.y },
      { x: here.x, y: rect.y - margin },
      { x: here.x, y: rect.y + rect.height + margin },
    ].filter(
      (p) =>
        p.x >= margin &&
        p.y >= margin &&
        p.x <= state.config.arena.width - margin &&
        p.y <= state.config.arena.height - margin &&
        !circleHitsWalls(p, state.config.playerRadius, [
          ...wallsOf(state.config.arena),
          ...breakablesOf(state.config.arena),
          ...fencesOf(state.config.arena),
        ]),
    );
    const best = exits.reduce<Vec2 | undefined>(
      (b, e) => (b === undefined || dist(here, e) < dist(here, b) ? e : b),
      undefined,
    );
    return best === undefined ? { x: 0, y: 0 } : norm(sub(best, here));
  }

  #handleShots(
    state: FuState,
    view: Observation,
    here: Vec2,
    can: { slashReady: boolean; dashAllowed: boolean; mine: number },
  ): 'DASH' | undefined {
    const p = this.#profile;
    const { config } = state;
    const reach = config.playerRadius + config.boomerangRadius;
    let result: 'DASH' | undefined;
    for (const shot of view.shots) {
      if (shot.deflectedBy === this.#id) continue;
      // where it is NOW, by advancing what it saw along the path it was on
      const speed = shot.state === 'RETURNING' ? config.returnSpeed : config.throwSpeed;
      let direction = shot.direction;
      // its heading (the rules track it home too); only a boomerang with none is assumed to head straight for its owner
      if (shot.state === 'RETURNING' && direction.x === 0 && direction.y === 0) {
        const owner =
          view.foes.find((f) => f.id === shot.ownerId)?.position ?? positionOf(state, shot.ownerId);
        direction = norm(sub(owner, shot.position));
      }
      const velocity = { x: direction.x * speed, y: direction.y * speed };
      const now = {
        x: shot.position.x + velocity.x * this.#delay * DT,
        y: shot.position.y + velocity.y * this.#delay * DT,
      };
      const rel = sub(here, now);
      const v2 = velocity.x * velocity.x + velocity.y * velocity.y;
      if (v2 < 1) continue;
      const along = (rel.x * velocity.x + rel.y * velocity.y) / v2; // seconds until closest approach
      if (along < 0 || along > p.horizon) continue;
      const miss = Math.hypot(rel.x - velocity.x * along, rel.y - velocity.y * along);
      if (miss > reach + 12) continue;
      this.#grudge.set(shot.ownerId, this.#tick);
      const range = dist(here, now);
      if (!this.#decided.has(shot.key + ':' + Math.floor(this.#tick / 90))) {
        this.#decided.add(shot.key + ':' + Math.floor(this.#tick / 90));
        // a boomerang coming back is easier to forget about than one thrown at you
        if (shot.state === 'RETURNING' && !this.#rng.chance(p.returnAwareness)) continue;
        this.stats.threats += 1;
        const tryDeflect = can.slashReady && this.#rng.chance(p.deflectTry);
        if (tryDeflect) {
          this.stats.deflectTries += 1;
          // press so that the swing is open while it is inside the blade's reach: when it is ~110 away
          const toward = norm(sub(now, here));
          const walking = {
            x: this.#move.x * state.config.playerSpeed,
            y: this.#move.y * state.config.playerSpeed,
          };
          const closing = speed + Math.max(0, walking.x * toward.x + walking.y * toward.y); // it knows how fast it walks
          const ticksToPress = Math.max(0, (range - 110) / (closing * DT));
          this.#pendingSlash = {
            at: this.#tick + Math.round(ticksToPress + this.#rng.gauss() * p.deflectJitter),
            aim: norm(sub(now, here)),
          };
        } else if (this.#rng.chance(p.dodge)) {
          this.stats.dodges += 1;
          const side = rel.x * velocity.y - rel.y * velocity.x >= 0 ? 1 : -1;
          const perp = norm({ x: -velocity.y * side, y: velocity.x * side });
          this.#dodge = { until: this.#tick + 14, dir: perp };
          if (
            can.dashAllowed &&
            this.#tick - this.#lastDash >= p.dashGap &&
            range / speed < 0.4 &&
            this.#rng.chance(p.dashUse)
          ) {
            this.#move = perp;
            this.#lastDash = this.#tick;
            result = 'DASH';
          }
        }
      }
    }
    return result;
  }

  #chooseTarget(
    state: FuState,
    view: Observation,
    here: Vec2,
    weaponsAway: boolean,
  ): FoeView | undefined {
    const p = this.#profile;
    const current = view.foes.find((f) => f.id === this.#target);
    if (current !== undefined && this.#tick < this.#targetUntil) return current;
    let best: FoeView | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const f of view.foes) {
      const d = dist(here, f.position);
      let score = -d / 200;
      score += lineIsClear(here, f.position, view.solids) ? 1 : 0;
      if (p.pressure) score += f.weaponsAway === f.weapons && f.weapons > 0 ? 2 : 0; // vulnerable
      if (p.pressure && weaponsAway && f.weaponsAway < f.weapons) score -= 1; // armed and I am not
      if (this.#tick - (this.#grudge.get(f.id) ?? -9999) < 240) score += p.lead > 0.5 ? 1.5 : 0.5; // the one that just shot at me
      if (p.lead === 0) score += this.#rng.range(-2, 2); // Easy picks poorly now and then
      if (score > bestScore) {
        bestScore = score;
        best = f; // strictly better wins; an exact tie keeps the earlier opponent in match order
      }
    }
    this.#target = best?.id;
    this.#targetUntil = this.#tick + p.retarget;
    return best;
  }

  #chooseBook(view: Observation, here: Vec2, foe: FoeView | undefined): Vec2 | undefined {
    const p = this.#profile;
    if (view.books.length === 0 || p.bookInterest === 0) return undefined;
    const nearest = view.books.reduce((b, c) => (dist(here, c) < dist(here, b) ? c : b));
    if (dist(here, nearest) > p.bookRange) return undefined;
    if (this.#rng.next() > p.bookInterest) return undefined;
    // a Hard CPU does not run into a fight it is losing for one: skip if a foe is much closer to it
    if (p.pressure && foe !== undefined && dist(foe.position, nearest) < dist(here, nearest) * 0.6)
      return undefined;
    return nearest;
  }

  /** The throw direction (unit) it would use, or undefined if it sees no worthwhile throw. */
  #aim(state: FuState, view: Observation, here: Vec2, foe: FoeView): Vec2 | undefined {
    const p = this.#profile;
    const { config } = state;
    // what it saw is `delay` ticks old: a skilled CPU carries the target forward by that much of its observed velocity
    const stale = this.#delay * DT * p.lead;
    const seen = {
      x: foe.position.x + foe.velocity.x * stale,
      y: foe.position.y + foe.velocity.y * stale,
    };
    // a quick throw curves (clockwise, curvature κ): to pass through a point at chord distance d it must start turned back by
    // half the arc, φ/2 with φ = 2·asin(dκ/2), and it flies the arc's length φ/κ to get there
    const kappa = config.throwCurvature;
    const arcTo = (d: number): number | undefined => {
      if (kappa <= 0) return d;
      const half = (d * kappa) / 2;
      return half >= 1 ? undefined : (2 * Math.asin(half)) / kappa;
    };
    let target = seen;
    for (let i = 0; i < 2; i += 1) {
      const t = (arcTo(dist(here, target)) ?? config.throwRange) / config.throwSpeed;
      target = {
        x: seen.x + foe.velocity.x * t * p.lead,
        y: seen.y + foe.velocity.y * t * p.lead,
      };
    }
    // a boomerang only flies so far: do not throw at an intercept point it cannot reach
    const arc = arcTo(dist(here, target));
    if (arc === undefined || arc > (config.throwRange + 30) * p.throwReach) return undefined;
    let dir = rotate(norm(sub(target, here)), -(arc * kappa) / 2);
    dir = rotate(dir, this.#rng.gauss() * p.aimError * (this.#rng.chance(p.aimLapse) ? 2.5 : 1));
    // follow the arc it will fly, in short chords, to the first thing it would meet
    const swept = sweepArc(
      here,
      dir,
      Math.min(config.throwRange, arc + 40),
      kappa,
      config,
      view.solids,
    );
    const reachesTarget = !swept.blocked || swept.flown >= arc - 20;
    if (reachesTarget) return dir;
    // blocked by cover: with EXPLOSIVE_BOOMERANG, a wall impact beside the target still counts
    const me = state.players.find((q) => q.id === this.#id);
    if (p.cover && me?.inventory.includes('EXPLOSIVE_BOOMERANG') === true) {
      const impact = swept.position;
      if (
        dist(impact, foe.position) < config.blastRadius * 0.85 &&
        lineClearTo(impact, foe.position, config.playerRadius, view.solids)
      )
        return dir;
    }
    return undefined;
  }

  #coverFrom(threat: Vec2, here: Vec2, state: FuState, view: Observation): Vec2 {
    const radius = state.config.playerRadius;
    const grid = navGridFor(state.config.arena, radius);
    let best: Vec2 | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 16; i += 1) {
      const angle = (Math.PI * 2 * i) / 16;
      for (const r of [140, 240]) {
        const q = { x: here.x + Math.cos(angle) * r, y: here.y + Math.sin(angle) * r };
        const [cx, cy] = grid.cellOf(q);
        if (!grid.isFree(cx, cy) || view.systems.hazards.some((h) => inRect(q, h.rect))) continue;
        const hidden = !lineIsClear(q, threat, view.solids);
        const score = (hidden ? 100 : 0) - r * 0.1 + dist(q, threat) * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = q;
        }
      }
    }
    return best === undefined ? { x: 0, y: 0 } : norm(sub(best, here));
  }

  /**
   * Where to go to fight an opponent: to them, or, when no ground it can walk on reaches them (an island across a gap), to
   * the nearest place it can walk to that has them in throwing range and in sight.
   */
  #approach(foe: Vec2, state: FuState, view: Observation, here: Vec2): Vec2 {
    const { arena, playerRadius, throwRange } = state.config;
    if (arena.ground === undefined) return foe;
    const grid = navGridFor(arena, playerRadius, state.config.dashSpeed * state.config.dashSeconds);
    const [fx, fy] = grid.cellOf(foe);
    const key = `${fx},${fy}`;
    if (this.#post === undefined || this.#post.key !== key || this.#tick - this.#post.at > 20) {
      const reach = grid.field(foe, () => false);
      const spot =
        grid.distanceAt(reach, here) >= 0
          ? foe
          : (grid.nearest(
              here,
              (p) => dist(p, foe) < throwRange * 0.85 && lineIsClear(p, foe, view.solids),
            ) ?? foe);
      this.#post = { key, at: this.#tick, spot };
    }
    return this.#post.spot;
  }

  #goTo(goal: Vec2, state: FuState, view: Observation, here: Vec2, fallback = true): void {
    const p = this.#profile;
    const radius = state.config.playerRadius;
    const grid = navGridFor(
      state.config.arena,
      radius,
      state.config.dashSpeed * state.config.dashSeconds,
    );
    const clear = (a: Vec2, b: Vec2): boolean => {
      const n = Math.ceil(dist(a, b) / 12);
      for (let i = 1; i <= n; i += 1) {
        const q = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
        if (circleHitsWalls(q, radius, view.solids)) return false;
      }
      return true;
    };
    const [gx, gy] = grid.cellOf(goal);
    const key = `${gx},${gy}|${view.systems.gates.map((g) => g.status).join('')}|${view.systems.hazards.map((h) => h.phase).join('')}`;
    if (this.#field === undefined || this.#field.key !== key || this.#tick - this.#field.at > 20) {
      const gates = view.systems.gates;
      const hazards = view.systems.hazards;
      const platforms = view.systems.platforms;
      const blocked = (cx: number, cy: number): boolean => {
        if (
          gates.some(
            (g) =>
              (g.status === 'CLOSED' ||
                (g.status === 'CLOSING' && p.hazardLookahead > 0 && g.secondsToChange < 0.8)) &&
              cellInRect(grid, cx, cy, g.rect, radius),
          )
        )
          return true;
        const c = grid.centre(cx, cy);
        return hazards.some((h) => {
          const danger =
            h.phase !== 'SAFE'
              ? p.hazardLookahead > 0 || h.phase === 'ACTIVE'
              : h.secondsToChange < p.hazardLookahead - 1;
          return (
            danger &&
            inRect(c, h.rect) &&
            !(p.usePlatforms && platforms.some((pl) => inRect(c, pl.rect)))
          );
        });
      };
      let data = grid.field(goal, blocked);
      if (grid.distanceAt(data, here) < 0)
        data = grid.field(goal, (cx, cy) =>
          gates.some((g) => g.status === 'CLOSED' && cellInRect(grid, cx, cy, g.rect, radius)),
        );
      this.#field = { key, at: this.#tick, data };
    }
    // the way goes over water by a dash from here: face the landing (decide dashes when it can, and waits on the edge till then)
    const landing = this.#leap ?? grid.leapAt(this.#field.data, here);
    if (landing !== undefined) {
      if (this.#leap === undefined) this.#leapSince = this.#tick;
      this.#leap = landing;
      this.#leapLoose = false;
      this.#onPlan = true;
      this.#planned = this.#move;
      this.#move = norm(sub(landing, here));
      return;
    }
    const next = grid.steer(this.#field.data, here, 8, clear);
    if (next !== undefined) {
      let heading = norm(sub(next, here));
      // a plan that turns it right round (the goal moved, and another way is now a little shorter) it takes only if that way is clearly
      // better: two ways about as long, swapped every replan, walked it out and back (the owner: "the going back and forth")
      const was = this.#planned;
      const outside = this.#zone !== undefined && !this.#inZone(here, this.#zone);
      if (
        !outside &&
        this.#tick - this.#plannedAt < 40 &&
        heading.x * was.x + heading.y * was.y < -0.2
      ) {
        const data = this.#field.data;
        const ahead = (d: Vec2): number =>
          grid.distanceAt(data, { x: here.x + d.x * 50, y: here.y + d.y * 50 });
        const keep = ahead(was);
        const turn = ahead(heading);
        if (
          keep >= 0 &&
          turn >= 0 &&
          keep <= turn + 4 &&
          !circleHitsWalls({ x: here.x + was.x * 30, y: here.y + was.y * 30 }, radius, view.solids)
        )
          heading = was;
      }
      this.#move = heading;
      this.#plannedAt = this.#tick;
      this.#onPlan = true;
      this.#planned = this.#move;
      return;
    }
    // no way there at all (another island no dash can reach): to the place it CAN reach nearest the goal, and it waits there,
    // still (walking at the water and being turned back by the edge was the back-and-forth the owner saw)
    if (
      fallback &&
      state.config.arena.ground !== undefined &&
      turntableUnder(here, state.config.arena, state.roundTime) === undefined
    ) {
      const near = this.#nearestReachable(grid, here, goal);
      if (near !== undefined && dist(near, here) > CELL_NEAR) {
        this.#goTo(near, state, view, here, false);
        return;
      }
      this.#move = { x: 0, y: 0 };
      return;
    }
    // no planned way: straight for the goal; but carried on a turntable (the cross pond's raft, where its plan has no
    // ground), only onto ground there now; otherwise it stays, carried, until ground lies that way
    const straight = norm(sub(goal, here));
    const ahead = { x: here.x + straight.x * radius, y: here.y + straight.y * radius };
    const t = state.roundTime;
    this.#move =
      turntableUnder(here, state.config.arena, t) === undefined ||
      onGround(ahead, state.config.arena, t)
        ? straight
        : { x: 0, y: 0 };
  }

  /** The cell it can walk (or dash) to from `here` that lies nearest `goal` as the crow flies. */
  #nearestReachable(grid: ReturnType<typeof navGridFor>, here: Vec2, goal: Vec2): Vec2 | undefined {
    const steps = grid.field(here, () => false);
    let best: Vec2 | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < steps.length; i += 1) {
      if ((steps[i] as number) < 0) continue;
      const cx = i % grid.cols;
      const c = grid.centre(cx, (i - cx) / grid.cols);
      const d = dist(c, goal);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** DASH to cover ground or to take a shortcut through a wall (only if it owns PHASE_DASH: the rules make that true or false). */
  #maybeDash(
    out: { dash?: true },
    state: FuState,
    view: Observation,
    here: Vec2,
    goal: Vec2,
    me: FuState['players'][number],
    dashAllowed: boolean,
    fatigued: boolean,
  ): void {
    const p = this.#profile;
    if (this.#tick - this.#lastDash < p.dashGap) return;
    if (this.#rng.chance(p.dashMisuse)) {
      // Easy: now and then it dashes for no good reason, tired or not, in a random direction
      out.dash = true;
      this.#move = rotate({ x: 1, y: 0 }, this.#rng.range(0, Math.PI * 2));
      this.stats.dashes += 1;
      return;
    }
    if (!dashAllowed || fatigued) return;
    if (!this.#rng.chance(p.dashUse * 0.4)) return;
    const toGoal = dist(here, goal);
    if (toGoal < 300) return;
    // an ordinary dash along the way when the way is long and clear
    if (toGoal > 420 && lineIsClear(here, goal, view.solids)) {
      out.dash = true;
      this.stats.dashes += 1;
    }
  }
}
