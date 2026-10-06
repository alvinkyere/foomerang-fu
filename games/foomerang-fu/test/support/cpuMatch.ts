import { FIXED_TIMESTEP_SECONDS as DT } from '@foomerang/game-core';
import {
  CpuController,
  PRIMITIVE_ARENA,
  PRIMITIVE_POWERUPS,
  SYSTEMS_ARENA,
  SYSTEMS_POWERUP_SPOTS,
  createFuMatch,
  seedFor,
  stepFu,
  type Difficulty,
  type FuArena,
  type FuEvent,
  type FuInputs,
  type FuPlayerInput,
  type FuState,
} from '../../src';

/** One participant: a CPU of some difficulty, or a human driven by a test script. */
export type Participant =
  | { readonly id: string; readonly cpu: Difficulty }
  | { readonly id: string; readonly human: (state: FuState, tick: number) => FuPlayerInput };

export interface MatchResult {
  readonly state: FuState;
  readonly events: FuEvent[];
  readonly controllers: Map<string, CpuController>;
  /** Every input handed to the rules, per tick (so a test can prove CPUs only used ordinary inputs). */
  readonly inputs: FuInputs[];
}

export interface MatchOptions {
  readonly participants: readonly Participant[];
  readonly arena?: FuArena;
  readonly seed?: number;
  readonly steps: number;
  readonly powerups?: boolean;
  readonly matchRounds?: number;
  readonly keepInputs?: boolean;
  readonly start?: (state: FuState) => FuState;
  /** Called after every step with the state, its events and the tick. */
  readonly onStep?: (state: FuState, events: readonly FuEvent[], tick: number) => void;
  readonly config?: Partial<FuState['config']>;
}

/** Plays a match through the real rules: each step every CPU decides, then `stepFu` runs on the inputs. */
export function playMatch(o: MatchOptions): MatchResult {
  const slots = [0, 3, 1, 2, 4, 5];
  const seed = o.seed ?? 1;
  const arena = o.arena ?? PRIMITIVE_ARENA;
  let state = createFuMatch(
    o.participants.map((p, i) => ({ id: p.id, slot: slots[i] as number })),
    {
      arena,
      seed,
      ...(o.powerups === true
        ? {
            powerups: {
              ...PRIMITIVE_POWERUPS,
              spots: arena === SYSTEMS_ARENA ? SYSTEMS_POWERUP_SPOTS : PRIMITIVE_POWERUPS.spots,
              firstSeconds: 1,
              intervalSeconds: 3,
            },
          }
        : {}),
      ...(o.matchRounds === undefined ? {} : { matchRounds: o.matchRounds }),
      ...(o.config ?? {}),
    },
  );
  if (o.start !== undefined) state = o.start(state);
  const controllers = new Map<string, CpuController>();
  o.participants.forEach((p, i) => {
    if ('cpu' in p) controllers.set(p.id, new CpuController(p.id, p.cpu, seedFor(seed, i)));
  });
  const events: FuEvent[] = [];
  const inputs: FuInputs[] = [];
  for (let tick = 0; tick < o.steps; tick += 1) {
    const frame = new Map<string, FuPlayerInput>();
    for (const p of o.participants) {
      const input =
        'cpu' in p ? (controllers.get(p.id) as CpuController).decide(state) : p.human(state, tick);
      frame.set(p.id, input);
    }
    const r = stepFu(state, frame, DT);
    state = r.state;
    events.push(...r.events);
    if (o.keepInputs === true) inputs.push(frame);
    o.onStep?.(state, r.events, tick);
  }
  return { state, events, controllers, inputs };
}
