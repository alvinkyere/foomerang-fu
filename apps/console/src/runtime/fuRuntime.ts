import { FIXED_TIMESTEP_SECONDS, type WorldState } from '@foomerang/game-core';
import { RumblePlanner, type PlannedRumble } from './rumblePlanner';
import {
  CpuController,
  FREE_FOR_ALL,
  continueRound,
  MARKET_PLAZA_ARENA,
  FU_BUTTONS,
  PRIMITIVE_ARENA,
  PRIMITIVE_POWERUPS,
  SYSTEMS_ARENA,
  systemsView,
  powerupsFor,
  createFuMatch,
  isFatigued,
  type FuArena,
  type FuConfig,
  type PowerKind,
  roundLabel,
  seedFor,
  stepFu,
  type FuEvent,
  type FuPlayerInput,
  type FuState,
} from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import type { PlayerAction } from '../host';
import { buildFuView } from '../render/fuView';
import { PLAYABLE_ARENAS, choiceOf } from './arenas';
import type { ArenaView } from '../render/viewModel';
import type { PackCharacter } from '../render/reconstructed/maps';
import { FrameStepper } from './frameStepper';
import { DEFAULT_MODE, type GameModeId } from './gameMode';
import type { PowerupMode } from './powerupMode';
import { InputBuffer } from './inputBuffer';
import { gameSecondsBetween } from './killSlowMo';
import type { MatchPhase, MatchPlayer, MatchRuntime, RuntimeMetrics } from './matchRuntime';
import type { SlotAllocator } from './slots';

/** Which generic platform action each of Fu's buttons arrives as: the game's own table, which the server advertises too. */
const SLASH_ACTION = FU_BUTTONS.SLASH;
const THROW_ACTION = FU_BUTTONS.THROW;
const DASH_ACTION = FU_BUTTONS.DASH;

/** Event ids remembered per player: far more than any real burst of presses. */
const DEDUP_WINDOW = 64;
/** Presentation events waiting for the next view; bounded so an unwatched match cannot grow without limit. */
const MAX_PENDING_EVENTS = 256;

/**
 * Foomerang Fu's driver in the console: the platform's input and clock in, Fu's rules out.
 *
 * It owns what the RULES must not know about — wall-clock frames, the latest-thumb buffer and its
 * 500 ms freshness, who is currently connected, and button event ids. Per rendered frame it runs
 * 0..5 fixed 1/60 s steps of `stepFu`. THROW is held: every step while it is down says `throwHeld` (the rules charge it, and
 * letting go throws); a press and release before a step runs is a tap, a one-step `throw: true`. A SLASH or DASH press becomes a
 * one-step `slash: true` / `dash: true` request on the next step that runs; the same event id can never act
 * twice (the server already deduplicates, this is the second line of defence), and a press that
 * cannot be applied now (the player is reconnecting) is dropped, never remembered to fire later.
 * When several arrive before one step the RULES decide (SLASH, then THROW, then DASH), never the
 * order they arrived in.
 */
export { SYSTEMS_ARENA, MARKET_PLAZA_ARENA };
export { PLAYABLE_ARENAS } from './arenas';

export class FuRuntime implements MatchRuntime {
  state: FuState | undefined;

  readonly #rumbles = new RumblePlanner();

  /** The phones' rumble: planned from each player's time outside the arena's border (none on an arena without one). */
  rumbles(nowMs: number): PlannedRumble[] {
    const state = this.state;
    if (state === undefined) return [];
    // the phones' buzz: time outside the border (where there is one), and pulling a dropped boomerang home
    const pulling = new Set(
      [...state.boomerangs, ...state.extraBoomerangs]
        .filter((b) => b.state === 'RECALLING')
        .map((b) => b.ownerId),
    );
    return this.#rumbles.plan(
      state.players.map((p) => ({
        id: p.id,
        alive: p.alive,
        outsideFor: state.config.arena.safeZone === undefined ? 0 : p.outsideFor,
        recalling: pulling.has(p.id),
      })),
      state.config.outsideLimitSeconds,
      nowMs,
    );
  }

  /** Repeated event ids the console itself discarded (the server normally catches them first). */
  duplicatesIgnored = 0;

  /** Which arena to play in: the primitive test arena, unless a test wants the open Slice 1 one. */
  readonly #arena: FuArena;

  /** Pickups appear only in the primitive test arena (the one with places to put them). */
  readonly #powerups: FuConfig['powerups'];

  readonly #enabled: readonly PowerKind[] | undefined;

  /** What the chosen mode asks of the rules (its win condition). Only Free For All exists; the director never starts another. */
  readonly #mode: GameModeId;

  /** Test/playtest override of the 14 kills that win (`?kills=`). */
  readonly #targetKills: number | undefined;

  constructor(
    arena: FuArena = PRIMITIVE_ARENA,
    powerups: PowerupMode = 'normal',
    enabled?: readonly PowerKind[],
    mode: GameModeId = DEFAULT_MODE,
    targetKills?: number,
    /** Each round's intro, READY … GO (the reference video: 2.84 s; render/roundIntro.ts). Default none. */
    roundIntroSeconds = 0,
    /** Where each match's seed comes from (`random()` in [0, 1)): what its Books give, where they and everyone appear. */
    random: () => number = Math.random,
    /** A kill freezes the game and plays it in slow motion (runtime/killSlowMo.ts, the HQ video). Default off. */
    slowMo = false,
  ) {
    this.#random = random;
    this.#slowMo = slowMo;
    this.#targetKills = targetKills;
    this.#roundIntroSeconds = roundIntroSeconds;
    if (mode !== 'FREE_FOR_ALL') throw new RangeError(`game mode ${mode} cannot be played yet`);
    this.#mode = mode;
    this.#arena = arena;
    this.#enabled = enabled;
    const choice = choiceOf(arena);
    const spots = choice === undefined ? undefined : PLAYABLE_ARENAS[choice].bookSpots; // no places to put Books: none
    this.#powerups =
      spots === undefined || powerups === 'off'
        ? undefined
        : powerups === 'fast'
          ? // one at a time, as the real schedules: with Books at random spots, a walk to one must not sweep up others
            { ...PRIMITIVE_POWERUPS, spots, firstSeconds: 1, intervalSeconds: 1, maxOnField: 1 }
          : powerupsFor(
              powerups === 'low' ? 'LOW' : powerups === 'high' ? 'HIGH' : 'NORMAL',
              spots,
            );
  }

  readonly #slowMo: boolean;
  #stepper = new FrameStepper();
  /**
   * The game's own clock: real time, except after a kill, when it freezes and then crawls (runtime/killSlowMo.ts, the HQ
   * video). The stepper runs on it; the remains and effects stay on the real clock.
   */
  #clock = { realMs: 0, gameMs: 0, killMs: undefined as number | undefined };
  #inputs = new InputBuffer();
  #isActive: (playerId: string) => boolean = () => true;
  #playerIds = new Set<string>();
  #pendingThrows = new Set<string>();
  /** Players holding THROW down now (the rules charge the throw; letting go throws it). */
  #holdingThrow = new Set<string>();
  /** Players who pressed THROW since the last step: a release before that step is a tap, a plain throw. */
  #throwPressedSinceStep = new Set<string>();
  #pendingSlashes = new Set<string>();
  #pendingDashes = new Set<string>();
  #seenEvents = new Map<string, { order: string[]; set: Set<string> }>();
  #events: FuEvent[] = [];
  /** Each player's chosen character, fixed when the match starts. */
  #characters: ReadonlyMap<string, PackCharacter> = new Map();
  /** CPU participants: software controllers that answer through the same `FuPlayerInput` a person's phone produces. */
  #cpus = new Map<string, CpuController>();
  readonly #roundIntroSeconds: number;
  readonly #random: () => number;
  #cpuDecisions = { count: 0, totalMs: 0, maxMs: 0 };

  get world(): WorldState | undefined {
    return this.state?.world;
  }

  start(players: readonly MatchPlayer[], nowMs: number): void {
    // The rules' default is the open Slice 1 arena; the game people play is the primitive test arena.
    this.state = createFuMatch(
      players.map((p) => ({ id: p.playerId, slot: p.slot })),
      {
        arena: this.#arena,
        // a fresh seed every match (owner, 2026-10-22: Books must not come the same way every time); the rules stay pure
        seed: Math.floor(this.#random() * 0x7fffffff),
        ...(this.#enabled === undefined ? {} : { enabledPowers: this.#enabled }),
        ...FREE_FOR_ALL,
        roundAdvance: 'ON_CONTINUE', // the scoreboard waits for CONTINUE between rounds (owner, 2026-10-19)
        ...(this.#roundIntroSeconds > 0 ? { roundIntroSeconds: this.#roundIntroSeconds } : {}),
        ...(this.#targetKills === undefined ? {} : { targetKills: this.#targetKills }),
        // first to 14 kills wins at once; nine rounds are regulation, then overtime; what players own lasts until the match ends
        ...(this.#powerups === undefined ? {} : { powerups: this.#powerups }),
      },
    );
    this.#stepper.start(nowMs);
    this.#clock = { realMs: nowMs, gameMs: nowMs, killMs: undefined };
    this.#inputs = new InputBuffer();
    this.#playerIds = new Set(players.map((p) => p.playerId));
    this.#characters = new Map(
      players.flatMap((p) =>
        p.character === undefined ? [] : [[p.playerId, p.character] as const],
      ),
    );
    this.#pendingThrows = new Set();
    this.#holdingThrow = new Set();
    this.#throwPressedSinceStep = new Set();
    this.#pendingSlashes = new Set();
    this.#pendingDashes = new Set();
    this.#seenEvents = new Map();
    this.#events = [];
    this.duplicatesIgnored = 0;
    // each CPU's randomness is the match seed mixed with its own index: replays are exact
    this.#cpus = new Map();
    this.#cpuDecisions = { count: 0, totalMs: 0, maxMs: 0 };
    players.forEach((p, index) => {
      if (p.cpu !== undefined)
        this.#cpus.set(
          p.playerId,
          new CpuController(p.playerId, p.cpu, seedFor(this.state?.config.seed ?? 1, index)),
        );
    });
  }

  /** After a pause (the host lost its server connection): the match carries on from where it was, not from the time that passed. */
  rebase(nowMs: number): void {
    this.#stepper.rebase(nowMs);
    this.#clock = { realMs: nowMs, gameMs: nowMs, killMs: undefined };
  }

  /** A pause begins: no held thumb and no queued press survives it. */
  neutralizeInput(): void {
    this.#inputs.clear();
    this.#pendingThrows.clear();
    this.#holdingThrow.clear(); // a charge does not survive a pause
    this.#throwPressedSinceStep.clear();
    this.#pendingSlashes.clear();
    this.#pendingDashes.clear();
  }

  matchPhase(): MatchPhase | undefined {
    const state = this.state;
    if (state === undefined) return undefined;
    return state.phase === 'ROUND_OVER' && state.roundOver?.awaitingContinue === true
      ? 'SCOREBOARD'
      : state.phase;
  }

  continueRound(): void {
    if (this.state === undefined) return;
    const result = continueRound(this.state);
    this.state = result.state;
    this.#events.push(...result.events);
  }

  setActivity(isActive: (playerId: string) => boolean): void {
    this.#isActive = isActive;
  }

  receiveInput(playerId: string, x: number, y: number, nowMs: number): void {
    if (!this.#playerIds.has(playerId)) return;
    this.#inputs.receive(playerId, x, y, nowMs);
  }

  receiveAction(action: PlayerAction): void {
    if (this.state === undefined || !this.#playerIds.has(action.playerId)) return;
    if (this.#alreadySeen(action.playerId, action.eventId)) {
      this.duplicatesIgnored += 1;
      return;
    }
    if (action.action === THROW_ACTION) {
      // THROW is held to charge and let go to throw (owner, 2026-10-19): the rules see it held, step by step
      if (!this.#isActive(action.playerId)) return;
      if (action.phase === 'pressed') {
        this.#holdingThrow.add(action.playerId);
        this.#throwPressedSinceStep.add(action.playerId);
      } else if (this.#holdingThrow.delete(action.playerId)) {
        // pressed and let go before a step ran: a tap
        if (this.#throwPressedSinceStep.has(action.playerId))
          this.#pendingThrows.add(action.playerId);
      }
      return;
    }
    if (action.phase !== 'pressed') return; // a release does nothing
    const pending =
      action.action === SLASH_ACTION
        ? this.#pendingSlashes
        : action.action === DASH_ACTION
          ? this.#pendingDashes
          : undefined;
    if (pending === undefined) return; // an action Fu does not use
    if (!this.#isActive(action.playerId)) return; // dropped, not remembered
    pending.add(action.playerId);
  }

  frame(nowMs: number): void {
    if (this.state === undefined) return;
    const clock = this.#clock;
    const real = Math.max(0, nowMs - clock.realMs);
    clock.gameMs +=
      clock.killMs === undefined
        ? real
        : gameSecondsBetween((clock.realMs - clock.killMs) / 1000, (nowMs - clock.killMs) / 1000) *
          1000;
    clock.realMs = nowMs;
    const steps = this.#stepper.advance(clock.gameMs);
    for (let i = 0; i < steps; i += 1) {
      const thumbs = this.#inputs.frame(nowMs, this.#isActive);
      const inputs = new Map<string, FuPlayerInput>();
      for (const [id, cpu] of this.#cpus) {
        const began = performance.now();
        inputs.set(id, cpu.decide(this.state));
        const took = performance.now() - began;
        this.#cpuDecisions.count += 1;
        this.#cpuDecisions.totalMs += took;
        if (took > this.#cpuDecisions.maxMs) this.#cpuDecisions.maxMs = took;
      }
      for (const player of this.state.players) {
        if (this.#cpus.has(player.id)) continue; // a CPU's input is already decided

        const move = thumbs.get(player.id);
        const active = i === 0 && this.#isActive(player.id);
        const wantsThrow = active && this.#pendingThrows.has(player.id);
        const wantsSlash = active && this.#pendingSlashes.has(player.id);
        const wantsDash = active && this.#pendingDashes.has(player.id);
        if (!this.#isActive(player.id)) this.#holdingThrow.delete(player.id); // gone: the charge is dropped
        const holding = this.#holdingThrow.has(player.id);
        if (move !== undefined || wantsThrow || wantsSlash || wantsDash || holding) {
          inputs.set(player.id, {
            ...(move === undefined ? {} : { move }),
            ...(wantsThrow ? { throw: true } : {}),
            ...(holding ? { throwHeld: true } : {}),
            ...(wantsSlash ? { slash: true } : {}),
            ...(wantsDash ? { dash: true } : {}),
          });
        }
      }
      if (i === 0) {
        // a press waits for a step that actually runs
        this.#pendingThrows.clear();
        this.#throwPressedSinceStep.clear();
        this.#pendingSlashes.clear();
        this.#pendingDashes.clear();
      }
      const result = stepFu(this.state, inputs, FIXED_TIMESTEP_SECONDS);
      this.state = result.state;
      this.#events.push(...result.events);
      // a kill (not a fall): the game freezes, then plays in slow motion (the HQ video)
      if (this.#slowMo && result.events.some((e) => e.type === 'HIT' && e.source !== 'FALL'))
        clock.killMs = nowMs;
    }
    if (this.#events.length > MAX_PENDING_EVENTS)
      this.#events.splice(0, this.#events.length - MAX_PENDING_EVENTS);
  }

  metrics(): RuntimeMetrics {
    return {
      ...this.#stepper.metrics(),
      staleNeutralizations: this.#inputs.staleNeutralizations,
      inputToSim: this.#inputs.latency(),
      players: this.#playerIds.size,
    };
  }

  view(roster: readonly RosterEntry[], slots: SlotAllocator): ArenaView | undefined {
    if (this.state === undefined) return undefined;
    return buildFuView(this.state, this.#events.splice(0), roster, slots, this.#characters);
  }

  debugState(): unknown {
    const state = this.state;
    if (state === undefined) return undefined;
    return {
      mode: this.#mode,
      round: state.round,
      roundLabel: roundLabel(state),
      scores: { ...state.scores },
      matchOver: state.matchOver,
      tiebreak: state.tiebreak,
      phase: state.phase,
      intro: state.intro ?? 0, // seconds of the round's intro left (READY … GO); 0: play is on
      walls: (state.config.arena.walls ?? []).map((w) => ({ ...w })),
      broken: [...state.broken],
      breakables: (state.config.arena.breakables ?? []).map((b) => b.id),
      elapsed: state.elapsed,
      winnerId: state.roundOver?.winnerId,
      players: state.players.map((p) => ({
        id: p.id,
        slot: p.slot,
        alive: p.alive,
        facing: { ...p.facing },
        slash: p.slash.phase,
        dash: p.dash.phase,
        inventory: [...p.inventory],
        charge: p.charge.phase,
        fatigue: {
          dashes: p.fatigue.dashes,
          recoverIn: p.fatigue.recoverIn,
          fatigued: isFatigued(p.fatigue, state.config),
        },
        frozen: p.frozen ?? 0, // ICE_BOOMERANG: seconds left frozen (0: not)
        burning: p.burning?.seconds ?? 0, // FIRE_BOOMERANG: seconds until the burn kills (0: not burning)
      })),
      pickups: state.pickups.map((p) => ({
        id: p.id,
        x: p.position.x,
        y: p.position.y,
      })),
      awards: state.awards,
      seed: state.config.seed, // this match's (fresh every match): what decides each Book's award
      roundTime: state.roundTime,
      systems: systemsView(state.config.arena, state.roundTime, state.gatesShut),
      boomerangs: [...state.boomerangs, ...state.extraBoomerangs].map((b) => ({
        blast: b.blast,
        direction: { x: b.direction.x, y: b.direction.y },
        ownerId: b.ownerId,
        state: b.state,
        x: b.position.x,
        y: b.position.y,
        travelled: b.travelled,
        follow: b.follow,
        wallSeconds: b.wallSeconds,
        deflections: b.deflections,
        deflectedBy: b.deflectedBy,
        power: b.power,
      })),
      duplicatesIgnored: this.duplicatesIgnored,
      cpus: [...this.#cpus].map(([id, c]) => ({ id, difficulty: c.difficulty, ...c.stats })),
      cpuDecisionMs: {
        decisions: this.#cpuDecisions.count,
        meanMs:
          this.#cpuDecisions.count === 0
            ? 0
            : this.#cpuDecisions.totalMs / this.#cpuDecisions.count,
        maxMs: this.#cpuDecisions.maxMs,
      },
    };
  }

  /** Records an event id; true if it had been seen already. Bounded per player. */
  #alreadySeen(playerId: string, eventId: string): boolean {
    let window = this.#seenEvents.get(playerId);
    if (window === undefined) {
      window = { order: [], set: new Set() };
      this.#seenEvents.set(playerId, window);
    }
    if (window.set.has(eventId)) return true;
    window.set.add(eventId);
    window.order.push(eventId);
    if (window.order.length > DEDUP_WINDOW) {
      const oldest = window.order.shift();
      if (oldest !== undefined) window.set.delete(oldest);
    }
    return false;
  }
}
