import type { ControllerContext } from '@foomerang/protocol';
import type { PlayerAction } from '../../host';
import { StickNavigator, type StickConfig, type StickDirection } from './stickNavigator';

/** What a phone means by a press or a tilt outside gameplay. */
export type MenuAction = StickDirection | 'select' | 'back' | 'secondary';

export interface RouterOptions {
  /** Where GAMEPLAY input goes: today's game input path, untouched. */
  readonly gameplay: {
    move(playerId: string, x: number, y: number, nowMs: number): void;
    action(action: PlayerAction): void;
  };
  /** Where console input goes: the shell's focus system. Called in a deterministic order. */
  readonly menu: (action: MenuAction, playerId: string) => void;
  readonly stick?: Partial<StickConfig>;
  /** Minimum spacing between accepted menu steps / presses, across ALL phones. */
  readonly gate?: { readonly navGapMs?: number; readonly pressGapMs?: number };
}

const NEUTRAL = 0.15;
const EVENT_WINDOW = 128;

type Held = 'game' | 'menu' | 'suppressed';

interface PlayerState {
  lastSeq: number;
  readonly seen: Set<string>;
  readonly held: Map<PlayerAction['action'], Held>;
  stick: { x: number; y: number };
  /** Held through a context boundary: reads as neutral until it truly is. */
  latched: boolean;
  readonly nav: StickNavigator;
}

const ACTION_TO_MENU: Readonly<Record<PlayerAction['action'], MenuAction>> = {
  PRIMARY: 'select',
  SECONDARY: 'back',
  TERTIARY: 'secondary',
};

/**
 * The host-side translation of controller input. Physical input → the current CONTEXT (which the
 * host itself owns) → the game, or the console.
 *
 *   GAMEPLAY                 → the game, exactly as before
 *   CONSOLE / PAUSED / RESULTS → joystick: navigate · SLASH: select · THROW: back · DASH: secondary
 *
 * Deliberately the second line of defence: controllers also neutralize their own held controls at a
 * boundary, but this layer does not trust that. At every context change anything held belongs to
 * the OLD meaning and must be released/neutral before it counts again, so the press that chose
 * "Resume" can never be a slash. No timers decide that: only release and neutral do.
 *
 * Several phones share ONE focus: menu steps and presses pass one global gate, in arrival order.
 */
export class InputRouter {
  readonly #options: RouterOptions;
  readonly #players = new Map<string, PlayerState>();
  readonly #navGap: number;
  readonly #pressGap: number;
  #context: ControllerContext = 'CONSOLE';
  #lastNavAt = Number.NEGATIVE_INFINITY;
  #lastPressAt = Number.NEGATIVE_INFINITY;

  constructor(options: RouterOptions) {
    this.#options = options;
    this.#navGap = options.gate?.navGapMs ?? 90;
    this.#pressGap = options.gate?.pressGapMs ?? 220;
  }

  get context(): ControllerContext {
    return this.#context;
  }

  /** How many event ids are remembered for a player (bounded). */
  trackedEventIds(playerId: string): number {
    return this.#players.get(playerId)?.seen.size ?? 0;
  }

  setContext(next: ControllerContext, nowMs: number): void {
    if (next === this.#context) return;
    const leavingGameplay = this.#context === 'GAMEPLAY';
    this.#context = next;
    for (const [playerId, player] of this.#players) {
      // Whatever is held belongs to the old meaning: it must be released before it counts again.
      for (const [action, held] of player.held) {
        if (held === 'game' && leavingGameplay) {
          // the game's own held state is closed out; the physical release will be dropped
          this.#options.gameplay.action({
            playerId,
            eventId: `boundary-${action}-${nowMs}`,
            action,
            phase: 'released',
          });
        }
        player.held.set(action, 'suppressed');
      }
      if (Math.hypot(player.stick.x, player.stick.y) > NEUTRAL) player.latched = true;
      player.nav.reset();
      if (leavingGameplay) this.#options.gameplay.move(playerId, 0, 0, nowMs);
    }
  }

  onMove(playerId: string, seq: number, x: number, y: number, nowMs: number): void {
    const player = this.#player(playerId);
    if (seq <= player.lastSeq) return; // stale or repeated
    player.lastSeq = seq;
    player.stick = { x, y };
    let ex = x;
    let ey = y;
    if (player.latched) {
      if (Math.hypot(x, y) > NEUTRAL) {
        ex = 0;
        ey = 0; // held through a boundary: it does not count
      } else {
        player.latched = false;
      }
    }
    if (this.#context === 'GAMEPLAY') {
      this.#options.gameplay.move(playerId, ex, ey, nowMs);
      return;
    }
    for (const direction of player.nav.update(ex, ey, nowMs)) {
      this.#emitNav(direction, playerId, nowMs);
    }
  }

  onAction(action: PlayerAction, nowMs: number): void {
    const player = this.#player(action.playerId);
    if (player.seen.has(action.eventId)) return; // a retry never acts twice
    player.seen.add(action.eventId);
    if (player.seen.size > EVENT_WINDOW) {
      const oldest = player.seen.values().next();
      if (!oldest.done) player.seen.delete(oldest.value);
    }

    const held = player.held.get(action.action);
    if (action.phase === 'released') {
      player.held.delete(action.action);
      if (held === 'suppressed') return; // closes a press that belonged to an earlier meaning
      if (this.#context === 'GAMEPLAY') this.#options.gameplay.action(action);
      return;
    }
    if (held === 'suppressed') return; // still the same physical hold
    if (this.#context === 'GAMEPLAY') {
      player.held.set(action.action, 'game');
      this.#options.gameplay.action(action);
      return;
    }
    // Marked held BEFORE it is delivered: if this very press changes the context (Resume), it is
    // already on record as belonging to the old meaning.
    player.held.set(action.action, 'menu');
    this.#emitPress(ACTION_TO_MENU[action.action], action.playerId, nowMs);
  }

  /** Repeat for held sticks. */
  tick(nowMs: number): void {
    if (this.#context === 'GAMEPLAY') return;
    for (const [playerId, player] of this.#players) {
      for (const direction of player.nav.tick(nowMs)) this.#emitNav(direction, playerId, nowMs);
    }
  }

  /** A player left or reconnected: a new stream starts from nothing. */
  playerGone(playerId: string): void {
    this.#players.delete(playerId);
  }

  #emitNav(direction: StickDirection, playerId: string, nowMs: number): void {
    if (nowMs - this.#lastNavAt < this.#navGap) return;
    this.#lastNavAt = nowMs;
    this.#options.menu(direction, playerId);
  }

  #emitPress(action: MenuAction, playerId: string, nowMs: number): void {
    if (nowMs - this.#lastPressAt < this.#pressGap) return;
    this.#lastPressAt = nowMs;
    this.#options.menu(action, playerId);
  }

  #player(playerId: string): PlayerState {
    let player = this.#players.get(playerId);
    if (player === undefined) {
      player = {
        lastSeq: -1,
        seen: new Set(),
        held: new Map(),
        stick: { x: 0, y: 0 },
        latched: false,
        nav: new StickNavigator(this.#options.stick),
      };
      this.#players.set(playerId, player);
    }
    return player;
  }
}
