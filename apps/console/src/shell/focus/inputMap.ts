import type { Direction } from './navigation';

/** The whole console input vocabulary. Every device is mapped onto exactly these. */
export type ConsoleAction = Direction | 'select' | 'back';

const KEYS: Readonly<Record<string, ConsoleAction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  Enter: 'select',
  ' ': 'select',
  Escape: 'back',
  Backspace: 'back',
};

export const keyToAction = (key: string): ConsoleAction | undefined => KEYS[key];

export interface PadState {
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean }>;
  readonly axes: readonly number[];
}

export interface GamepadOptions {
  readonly repeatDelayMs?: number;
  readonly repeatIntervalMs?: number;
  readonly deadZone?: number;
}

// Standard mapping: A = 0, B = 1, D-pad = 12..15. (Face-button glyphs follow the standard layout.)
const BUTTONS: ReadonlyArray<readonly [number, ConsoleAction]> = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
  [0, 'select'],
  [1, 'back'],
];
const REPEATS: ReadonlySet<ConsoleAction> = new Set(['up', 'down', 'left', 'right']);

/** Turns polled gamepad snapshots into discrete actions: press edges, plus repeat for directions. */
export class GamepadMapper {
  readonly #delay: number;
  readonly #interval: number;
  readonly #dead: number;
  readonly #held = new Map<ConsoleAction, { since: number; lastFired: number }>();

  constructor(options: GamepadOptions = {}) {
    this.#delay = options.repeatDelayMs ?? 420;
    this.#interval = options.repeatIntervalMs ?? 110;
    this.#dead = options.deadZone ?? 0.55;
  }

  poll(pad: PadState, nowMs: number): ConsoleAction[] {
    const down = new Set<ConsoleAction>();
    for (const [index, action] of BUTTONS) if (pad.buttons[index]?.pressed) down.add(action);
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    if (Math.abs(x) > this.#dead && Math.abs(x) >= Math.abs(y)) down.add(x > 0 ? 'right' : 'left');
    else if (Math.abs(y) > this.#dead) down.add(y > 0 ? 'down' : 'up');

    const fired: ConsoleAction[] = [];
    for (const action of [...this.#held.keys()]) if (!down.has(action)) this.#held.delete(action);
    for (const action of down) {
      const state = this.#held.get(action);
      if (state === undefined) {
        this.#held.set(action, { since: nowMs, lastFired: nowMs });
        fired.push(action);
      } else if (REPEATS.has(action)) {
        const due =
          state.lastFired === state.since
            ? nowMs - state.since >= this.#delay
            : nowMs - state.lastFired >= this.#interval;
        if (due) {
          state.lastFired = nowMs;
          fired.push(action);
        }
      }
    }
    return fired;
  }
}
