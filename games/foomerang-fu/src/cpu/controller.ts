import { FIXED_TIMESTEP_SECONDS as DT, type Vec2 } from '@foomerang/game-core';
import {
  circleHitsWalls,
  lineClearTo,
  lineIsClear,
  sweepCircle,
  wallsOf,
  type Rect,
} from '../rules/arena';
import { planPhaseDash } from '../rules/phase';
import type { FuPlayerInput } from '../rules/step';
import type { FuState } from '../rules/state';
import { gatesOf, inRect, systemsView, type SystemsView } from '../rules/systems';
import { cellInRect, navGridFor } from './nav';
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
  readonly solids: readonly Rect[];
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
const positionOf = (s: FuState, id: string): Vec2 =>
  s.world.bodies.find((b) => b.id === id)?.position ?? { x: 0, y: 0 };

function observe(past: FuState, earlier: FuState, selfId: string): Observation {
  const gates = gatesOf(past.config.arena);
  const systems = systemsView(past.config.arena, past.roundTime, past.gatesShut);
  const solids: Rect[] = [...wallsOf(past.config.arena)];
  gates.forEach((g, k) => {
    if (past.gatesShut[k] === true) solids.push(g.rect);
  });
  const gap = Math.max(DT, past.elapsed - earlier.elapsed);
  const weaponsOf = (s: FuState, id: string) =>
    [...s.boomerangs, ...s.extraBoomerangs].filter((b) => b.ownerId === id);
  const foes: FoeView[] = past.players.flatMap((p): FoeView[] => {
    if (p.id === selfId || !p.alive) return [];
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
      if (b.state === 'HELD' || b.ownerId === selfId) return [];
      return [
        {
          key: `${b.ownerId}:${n}`,
          ownerId: b.ownerId,
          state: b.state,
          position: b.position,
          direction: b.direction,
          deflectedBy: b.deflectedBy,
        },
      ];
    },
  );
  return { foes, shots, books: past.pickups.map((p) => p.position), systems, solids };
}

export class CpuController {
  readonly #id: string;
  readonly #profile: Profile;
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
  #pendingSlash: { at: number; aim: Vec2 } | undefined;
  #dodge: { until: number; dir: Vec2 } | undefined;
  readonly #decided = new Set<string>();
  readonly #grudge = new Map<string, number>();
  #field: { key: string; at: number; data: Int16Array } | undefined;
  /** Counters for evaluation only; nothing reads them to decide. */
  readonly stats = { deflectTries: 0, dodges: 0, dashes: 0, throws: 0, slashes: 0, lapses: 0 };

  readonly difficulty: Difficulty;

  constructor(id: string, difficulty: Difficulty, seed: number) {
    this.#id = id;
    this.difficulty = difficulty;
    this.#profile = PROFILES[difficulty];
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
      this.#wander = 0;
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
    }
    const dir = aimOverride ?? this.#move;
    const input: { move: Vec2; throw?: true; slash?: true; dash?: true } = { move: dir, ...out };
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
    const here = positionOf(state, this.#id);
    const mine = [...state.boomerangs, ...state.extraBoomerangs].filter(
      (b) => b.ownerId === this.#id,
    );
    const twin = me.inventory.includes('TWIN_THROW');
    const heldCount = mine.filter((b) => b.state === 'HELD').length;
    const throwReady =
      (twin ? heldCount === mine.length : heldCount > 0) &&
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

    // 1. the floor: get off danger it can see (Easy only reacts once it is ACTIVE; the others on WARNING)
    for (const h of view.systems.hazards) {
      const danger =
        h.phase === 'ACTIVE' ||
        (h.phase === 'WARNING' && p.hazardLookahead > 0) ||
        (h.phase === 'SAFE' && h.secondsToChange < p.hazardLookahead - 1);
      if (danger && inRect(here, h.rect) && !onPlatform) {
        this.#move = this.#exitFrom(h.rect, here, state);
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
      return;
    }

    // 3. who to fight
    const foe = this.#chooseTarget(state, view, here, heldCount === 0);
    const bold = me.inventory.includes('GUARD'); // a shield makes it press a little harder
    // 4. what to fetch (a Book is a mystery: it never knows what it will get)
    const book = this.#chooseBook(view, here, foe);

    // a Book is a lasting upgrade: unless a fight is right on top of it, it goes to fetch one
    if (book !== undefined && (foe === undefined || dist(here, foe.position) > 330)) {
      this.#goTo(book, state, view, here);
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
        return;
      }
      // ranged
      if (throwReady && d <= (config.throwRange + 40) * p.throwReach) {
        const shot = this.#aim(state, view, here, foe, twin);
        if (shot !== undefined) {
          out.throw = true;
          this.stats.throws += 1;
          this.#move = { x: shot.x * 0.3, y: shot.y * 0.3 };
          return;
        }
      }
      // pressure: an opponent with nothing in hand is there to be hunted
      const hunted = p.pressure && foe.weaponsAway === foe.weapons && foe.weapons > 0;
      // when its own weapons are away and an armed foe is near, get out of sight
      if (p.cover && heldCount === 0 && !hunted && d < 420) {
        this.#move = this.#coverFrom(foe.position, here, state, view);
        return;
      }
      if (book !== undefined && !hunted) {
        this.#goTo(book, state, view, here);
        this.#maybeDash(out, state, view, here, book, me, dashAllowed, fatigued);
        return;
      }
      const stand =
        throwReady && !hunted && !bold ? config.throwRange * 0.55 : config.slashReach * 0.6;
      if (d > stand || !los) {
        this.#goTo(foe.position, state, view, here);
        // never a committed dash down an armed opponent's line of fire
        const loaded = los && foe.weapons > foe.weaponsAway;
        if (!loaded)
          this.#maybeDash(out, state, view, here, foe.position, me, dashAllowed, fatigued);
      } else {
        this.#move = { x: 0, y: 0 };
      }
      return;
    }
    if (book !== undefined) {
      this.#goTo(book, state, view, here);
      return;
    }
    this.#move = { x: 0, y: 0 };
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
        !circleHitsWalls(p, state.config.playerRadius, wallsOf(state.config.arena)),
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
      if (shot.state === 'RETURNING') {
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
          if (can.dashAllowed && range / speed < 0.4 && this.#rng.chance(p.dashUse)) {
            this.#move = perp;
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
  #aim(
    state: FuState,
    view: Observation,
    here: Vec2,
    foe: FoeView,
    twin: boolean,
  ): Vec2 | undefined {
    const p = this.#profile;
    const { config } = state;
    // what it saw is `delay` ticks old: a skilled CPU carries the target forward by that much of its observed velocity
    const stale = this.#delay * DT * p.lead;
    const seen = {
      x: foe.position.x + foe.velocity.x * stale,
      y: foe.position.y + foe.velocity.y * stale,
    };
    let target = seen;
    for (let i = 0; i < 2; i += 1) {
      const t = dist(here, target) / config.throwSpeed;
      target = {
        x: seen.x + foe.velocity.x * t * p.lead,
        y: seen.y + foe.velocity.y * t * p.lead,
      };
    }
    // a boomerang only flies so far: do not throw at an intercept point it cannot reach
    if (dist(here, target) > (config.throwRange + 30) * p.throwReach) return undefined;
    let dir = norm(sub(target, here));
    dir = rotate(dir, this.#rng.gauss() * p.aimError);
    if (twin && p.lead > 0.5) dir = rotate(dir, config.twinSpreadRadians); // so one of the pair is on the target
    const range = config.throwRange;
    const end = { x: here.x + dir.x * range, y: here.y + dir.y * range };
    const swept = sweepCircle(here, end, config.boomerangRadius, view.solids);
    const reachesTarget =
      !swept.blocked || dist(here, swept.position) >= dist(here, foe.position) - 20;
    if (reachesTarget) return dir;
    // blocked by cover: with BLAST_BOOMERANG, a wall impact beside the target still counts
    const me = state.players.find((q) => q.id === this.#id);
    if (p.cover && me?.inventory.includes('BLAST_BOOMERANG') === true) {
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

  #goTo(goal: Vec2, state: FuState, view: Observation, here: Vec2): void {
    const p = this.#profile;
    const radius = state.config.playerRadius;
    const grid = navGridFor(state.config.arena, radius);
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
    const next = grid.steer(this.#field.data, here, 8, clear);
    this.#move = next === undefined ? norm(sub(goal, here)) : norm(sub(next, here));
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
    const { config } = state;
    if (this.#rng.chance(p.dashMisuse)) {
      // Easy: now and then it dashes for no good reason, tired or not, in a random direction
      out.dash = true;
      this.#move = rotate({ x: 1, y: 0 }, this.#rng.range(0, Math.PI * 2));
      this.stats.dashes += 1;
      return;
    }
    if (!dashAllowed || fatigued || !this.#rng.chance(p.dashUse * 0.4)) return;
    const radius = config.playerRadius;
    const toGoal = dist(here, goal);
    if (toGoal < 300) return;
    // through-the-wall shortcut: look in 16 directions for a dash that ends up meaningfully closer, by walking distance
    if (p.phaseRoutes && me.inventory.includes('PHASE_DASH')) {
      const grid = navGridFor(config.arena, radius);
      const field = grid.field(goal, () => false);
      const here0 = grid.distanceAt(field, here);
      const base =
        config.dashSpeed *
        config.dashSeconds *
        (me.inventory.includes('OVERDRIVE') ? config.overdriveDashFactor : 1);
      const others = state.world.bodies.filter((b) => b.id !== this.#id);
      let best: { dir: Vec2; gain: number } | undefined;
      for (let i = 0; i < 16; i += 1) {
        const dir = { x: Math.cos((Math.PI * 2 * i) / 16), y: Math.sin((Math.PI * 2 * i) / 16) };
        const len = planPhaseDash(here, dir, base, radius, view.solids, config.arena, others);
        const end = { x: here.x + dir.x * len, y: here.y + dir.y * len };
        const there = grid.distanceAt(field, end);
        if (there < 0 || here0 < 0) continue;
        const gain = here0 - there;
        if (gain > 8 && (best === undefined || gain > best.gain)) best = { dir, gain };
      }
      if (best !== undefined) {
        out.dash = true;
        this.#move = best.dir;
        this.stats.dashes += 1;
        return;
      }
    }
    // an ordinary dash along the way when the way is long and clear
    if (toGoal > 420 && lineIsClear(here, goal, view.solids)) {
      out.dash = true;
      this.stats.dashes += 1;
    }
  }
}
