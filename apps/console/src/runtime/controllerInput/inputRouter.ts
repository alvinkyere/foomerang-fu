import {
  SYSTEM_ACTIONS,
  type ControllerContext,
  type InputAction,
  type SystemAction,
} from '@foomerang/protocol';
import type { ControllerAction, PlayerAction } from '../../host';
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
  /** The phone's own system buttons (MENU: pause). Heard in every context; the console decides what they mean there. */
  readonly system?: (action: SystemAction, playerId: string) => void;
  readonly stick?: Partial<StickConfig>;
  /** Minimum spacing between accepted menu steps / presses, across ALL phones. */
  readonly gate?: { readonly navGapMs?: number; readonly pressGapMs?: number };
  /**
   * Asked on every step: true while each phone drives its OWN cursor (character select), so the gates above apply per phone
   * and several people steering at once never cancel one another. False (the default): one shared focus.
   */
  readonly ownCursors?: () => boolean;
}

const NEUTRAL = 0.15;
const EVENT_WINDOW = 128;

type Held = 'game' | 'menu' | 'system' | 'suppressed';

interface PlayerState {
  lastSeq: number;
  readonly seen: Set<string>;
  readonly held: Map<InputAction, Held>;
  stick: { x: number; y: number };
  /** Held through a context boundary: reads as neutral until it truly is. */
  latched: boolean;
  readonly nav: StickNavigator;
  /** Its own gates, used while each phone has its own cursor. */
  lastNavAt: number;
  lastPressAt: number;
}

const SYSTEM: ReadonlySet<InputAction> = new Set<InputAction>(SYSTEM_ACTIONS);
const isSystem = (action: InputAction): action is SystemAction => SYSTEM.has(action);

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
  #lastSystemAt = Number.NEGATIVE_INFINITY;

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
        if (held === 'game' && leavingGameplay && !isSystem(action)) {
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

  onAction(action: ControllerAction, nowMs: number): void {
    const player = this.#player(action.playerId);
    if (player.seen.has(action.eventId)) return; // a retry never acts twice
    player.seen.add(action.eventId);
    if (player.seen.size > EVENT_WINDOW) {
      const oldest = player.seen.values().next();
      if (!oldest.done) player.seen.delete(oldest.value);
    }

    const kind = action.action;
    if (isSystem(kind)) {
      this.#onSystem(player, kind, action, nowMs);
      return;
    }
    const game: PlayerAction = { ...action, action: kind }; // the compiler now knows it is the game's
    const held = player.held.get(game.action);
    if (game.phase === 'released') {
      player.held.delete(game.action);
      if (held === 'suppressed') return; // closes a press that belonged to an earlier meaning
      if (this.#context === 'GAMEPLAY') this.#options.gameplay.action(game);
      return;
    }
    if (held === 'suppressed') return; // still the same physical hold
    if (this.#context === 'GAMEPLAY') {
      player.held.set(game.action, 'game');
      this.#options.gameplay.action(game);
      return;
    }
    // Marked held BEFORE it is delivered: if this very press changes the context (Resume), it is
    // already on record as belonging to the old meaning.
    player.held.set(game.action, 'menu');
    this.#emitPress(ACTION_TO_MENU[game.action], game.playerId, nowMs);
  }

  /**
   * A system button. Like any press it must be released before it counts again (the PAUSE press that
   * opened the menu is not also the one that closes it), and presses from several phones close
   * together collapse to one, so two people pausing at once never pause-and-resume.
   */
  #onSystem(
    player: PlayerState,
    action: SystemAction,
    event: ControllerAction,
    nowMs: number,
  ): void {
    if (event.phase === 'released') {
      player.held.delete(action);
      return;
    }
    if (player.held.has(action)) return; // still the same physical hold
    player.held.set(action, 'system');
    if (nowMs - this.#lastSystemAt < this.#pressGap) return;
    this.#lastSystemAt = nowMs;
    this.#options.system?.(action, event.playerId);
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
    if (this.#options.ownCursors?.() === true) {
      const player = this.#player(playerId);
      if (nowMs - player.lastNavAt < this.#navGap) return;
      player.lastNavAt = nowMs;
    } else {
      if (nowMs - this.#lastNavAt < this.#navGap) return;
      this.#lastNavAt = nowMs;
    }
    this.#options.menu(direction, playerId);
  }

  #emitPress(action: MenuAction, playerId: string, nowMs: number): void {
    if (this.#options.ownCursors?.() === true) {
      const player = this.#player(playerId);
      if (nowMs - player.lastPressAt < this.#pressGap) return;
      player.lastPressAt = nowMs;
    } else {
      if (nowMs - this.#lastPressAt < this.#pressGap) return;
      this.#lastPressAt = nowMs;
    }
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
        lastNavAt: Number.NEGATIVE_INFINITY,
        lastPressAt: Number.NEGATIVE_INFINITY,
      };
      this.#players.set(playerId, player);
    }
    return player;
  }
}
