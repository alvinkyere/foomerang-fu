import { stepFu, type FuEvent, type FuPlayerInput, type FuState } from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import { buildFuView } from '../render/fuView';
import type { ArenaRenderer } from '../render/renderer';
import { createGardenArena } from '../render/phaser/garden/GardenArena';
import { SlotAllocator } from '../runtime/slots';
import { SCENARIOS, startState, type Scenario } from './scenarios';

/**
 * DEVELOPMENT ONLY (not part of the production build). Plays a scripted scenario through the real rules and draws it with
 * the real Garden renderer, either in real time (`play`) or on a VIRTUAL clock that a capture script steps frame by frame
 * (`reset` + `frame(n)`): deterministic frames at 30 fps, comparable with the reference video's.
 */
const NAMES: Record<string, string> = {
  a: 'Alvin',
  b: 'Bea',
  c: 'Cleo',
  d: 'Dev',
  e: 'Eli',
  f: 'Fay',
};
const DT = 1 / 60;
const FRAME_MS = 1000 / 30;

interface Run {
  scenario: Scenario;
  state: FuState;
  tick: number;
  roster: RosterEntry[];
  slots: SlotAllocator;
  pending: FuEvent[];
}

let renderer: ArenaRenderer | undefined;
let drive: ((ms: number) => void) | undefined;
let run: Run | undefined;
let realTime: number | undefined;

async function ensureRenderer(): Promise<void> {
  if (renderer !== undefined) return;
  const host = document.getElementById('arena');
  if (host === null) throw new Error('no #arena');
  renderer = await createGardenArena(host);
}

function begin(name: string): Run {
  const scenario = SCENARIOS.find((s) => s.name === name);
  if (scenario === undefined) throw new Error(`no scenario ${name}`);
  const roster: RosterEntry[] = scenario.players.map((id) => ({
    playerId: id,
    displayName: NAMES[id] ?? id,
    connection: 'CONNECTED',
    seat: 'HELD',
  }));
  const slots = new SlotAllocator();
  slots.sync(roster.map((r) => ({ playerId: r.playerId, seated: true })));
  return { scenario, state: startState(scenario), tick: 0, roster, slots, pending: [] };
}

function simulate(r: Run, untilMs: number): void {
  while (r.tick * DT * 1000 < untilMs) {
    const scripted = r.scenario.inputs(r.tick, r.state);
    const inputs = new Map<string, FuPlayerInput>(Object.entries(scripted));
    const result = stepFu(r.state, inputs, DT);
    r.state = result.state;
    r.pending.push(...result.events);
    r.tick += 1;
  }
}

function present(r: Run): void {
  const view = buildFuView(r.state, r.pending.splice(0), r.roster, r.slots);
  renderer?.render(view);
}

const api = {
  scenarios: SCENARIOS.map((s) => ({ name: s.name, about: s.about, seconds: s.seconds })),
  /** Starts a scenario on the virtual clock (frame 0 is drawn). */
  async reset(name: string): Promise<void> {
    await ensureRenderer();
    drive ??= renderer?.driveClock?.();
    run = begin(name);
    realTime = undefined;
    present(run);
    drive?.(0);
  },
  /** Steps to virtual frame `n` (30 fps) and draws it. */
  frame(n: number): void {
    if (run === undefined) throw new Error('reset first');
    const ms = n * FRAME_MS;
    simulate(run, ms);
    present(run);
    drive?.(ms);
  },
  /** Plays a scenario in real time (for looking at it). */
  async play(name: string): Promise<void> {
    await ensureRenderer();
    run = begin(name);
    const start = performance.now();
    realTime = start;
    const tickLoop = (now: number): void => {
      if (run === undefined || realTime !== start) return;
      simulate(run, now - start);
      present(run);
      requestAnimationFrame(tickLoop);
    };
    requestAnimationFrame(tickLoop);
  },
  state: () => run?.state,
};

declare global {
  interface Window {
    __SHOWCASE__?: typeof api;
  }
}
window.__SHOWCASE__ = api;
