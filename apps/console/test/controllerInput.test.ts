import { describe, expect, it } from 'vitest';
import { InputRouter, StickNavigator, type MenuAction } from '../src/runtime/controllerInput';
import type { ControllerAction, PlayerAction } from '../src/host';

// ---------------------------------------------------------------------------------------------
// The joystick as a D-pad
// ---------------------------------------------------------------------------------------------
describe('StickNavigator: a thumb stick becomes discrete menu steps', () => {
  const nav = () => new StickNavigator();

  it('one deliberate tilt is one step', () => {
    const n = nav();
    expect(n.update(1, 0, 0)).toEqual(['right']);
    expect(n.update(1, 0, 16)).toEqual([]);
    expect(n.update(0.95, 0.05, 32)).toEqual([]);
  });

  it('picks the dominant axis, and a half-diagonal is not a step', () => {
    expect(nav().update(0, -1, 0)).toEqual(['up']);
    expect(nav().update(0, 1, 0)).toEqual(['down']);
    expect(nav().update(-1, 0.2, 0)).toEqual(['left']);
    expect(nav().update(0.7, 0.7, 0)).toEqual([]);
  });

  it('small stick noise never moves focus (dead zone)', () => {
    const n = nav();
    for (const v of [0.05, 0.2, 0.35, 0.45, 0.5]) {
      expect(n.update(v, 0, 0)).toEqual([]);
      expect(n.update(0, -v, 10)).toEqual([]);
    }
  });

  it('returning toward neutral resets the latch: the next tilt steps again', () => {
    const n = nav();
    expect(n.update(1, 0, 0)).toEqual(['right']);
    expect(n.update(0.1, 0, 50)).toEqual([]); // back to centre
    expect(n.update(1, 0, 100)).toEqual(['right']);
  });

  it('hysteresis: easing off a little keeps the latch (no re-fire, no flicker) until it is really neutral', () => {
    const n = nav();
    expect(n.update(1, 0, 0)).toEqual(['right']);
    expect(n.update(0.45, 0, 20)).toEqual([]); // between release and engage
    expect(n.update(0.9, 0, 40)).toEqual([]); // still the same hold, not a new tilt
  });

  it('a held direction repeats after a delay, at a steady cadence, via tick()', () => {
    const n = new StickNavigator({ repeatDelayMs: 400, repeatIntervalMs: 120 });
    expect(n.update(0, 1, 0)).toEqual(['down']);
    expect(n.tick(200)).toEqual([]);
    expect(n.tick(399)).toEqual([]);
    expect(n.tick(400)).toEqual(['down']);
    expect(n.tick(500)).toEqual([]);
    expect(n.tick(520)).toEqual(['down']);
    expect(n.tick(640)).toEqual(['down']);
  });

  it('stops repeating the instant it returns toward neutral', () => {
    const n = new StickNavigator({ repeatDelayMs: 400, repeatIntervalMs: 120 });
    n.update(1, 0, 0);
    n.tick(400);
    n.update(0, 0, 410);
    expect(n.tick(600)).toEqual([]);
    expect(n.tick(2_000)).toEqual([]);
  });

  it('changing direction steps at once in the new direction', () => {
    const n = nav();
    expect(n.update(1, 0, 0)).toEqual(['right']);
    expect(n.update(0, 1, 30)).toEqual(['down']);
  });

  it('a stick that has gone quiet (a lost phone) is treated as released, never as held forever', () => {
    const n = new StickNavigator({ repeatDelayMs: 400, repeatIntervalMs: 120, staleMs: 600 });
    n.update(1, 0, 0);
    expect(n.tick(700)).toEqual([]);
    expect(n.tick(900)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The router: physical input → (context) → game or console
// ---------------------------------------------------------------------------------------------
type GameCall = ['move', string, number, number] | ['action', string, string, string];

function rig(options: { navGapMs?: number; pressGapMs?: number } = { navGapMs: 0, pressGapMs: 0 }) {
  const game: GameCall[] = [];
  const menu: [MenuAction, string][] = [];
  const system: [string, string][] = [];
  let clock = 0;
  const router = new InputRouter({
    system: (action, playerId) => system.push([action, playerId]),
    gameplay: {
      move: (p, x, y) => game.push(['move', p, x, y]),
      action: (a: PlayerAction) => game.push(['action', a.playerId, a.action, a.phase]),
    },
    menu: (action, playerId) => menu.push([action, playerId]),
    gate: { navGapMs: options.navGapMs ?? 0, pressGapMs: options.pressGapMs ?? 0 },
  });
  let seq = 0;
  let ev = 0;
  const api = {
    router,
    game,
    menu,
    system,
    at: (t: number) => (clock = t),
    move: (p: string, x: number, y: number, s = (seq += 1)) => router.onMove(p, s, x, y, clock),
    press: (p: string, action: ControllerAction['action'], id = `e${(ev += 1)}-padding`) =>
      router.onAction({ playerId: p, eventId: id, action, phase: 'pressed' }, clock),
    release: (p: string, action: ControllerAction['action'], id = `e${(ev += 1)}-padding`) =>
      router.onAction({ playerId: p, eventId: id, action, phase: 'released' }, clock),
    context: (c: Parameters<InputRouter['setContext']>[0]) => router.setContext(c, clock),
  };
  return api;
}

describe('GAMEPLAY: today’s mappings, unchanged', () => {
  it('movement and every button go straight to the game, and nothing to the console', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.move('a', 0.5, -0.5);
    r.press('a', 'PRIMARY');
    r.release('a', 'PRIMARY');
    r.press('a', 'SECONDARY');
    r.press('a', 'TERTIARY');
    expect(r.game).toEqual([
      ['move', 'a', 0.5, -0.5],
      ['action', 'a', 'PRIMARY', 'pressed'],
      ['action', 'a', 'PRIMARY', 'released'],
      ['action', 'a', 'SECONDARY', 'pressed'],
      ['action', 'a', 'TERTIARY', 'pressed'],
    ]);
    expect(r.menu).toEqual([]);
  });
});

describe.each(['CONSOLE', 'PAUSED', 'RESULTS'] as const)(
  '%s: the same thumbs are a console controller',
  (context) => {
    it('joystick → navigate, SLASH → select, THROW → back, DASH → secondary; nothing reaches the game', () => {
      const r = rig();
      r.context(context);
      r.move('a', 0, 1);
      r.press('a', 'PRIMARY');
      r.release('a', 'PRIMARY');
      r.press('a', 'SECONDARY');
      r.release('a', 'SECONDARY');
      r.press('a', 'TERTIARY');
      expect(r.menu).toEqual([
        ['down', 'a'],
        ['select', 'a'],
        ['back', 'a'],
        ['secondary', 'a'],
      ]);
      expect(r.game).toEqual([]);
    });
  },
);

describe('context switching', () => {
  it('follows the context the host sets, and only that', () => {
    const r = rig();
    r.context('CONSOLE');
    r.press('a', 'PRIMARY');
    r.release('a', 'PRIMARY');
    r.context('GAMEPLAY');
    r.press('a', 'PRIMARY');
    expect(r.menu).toEqual([['select', 'a']]);
    expect(r.game).toEqual([['action', 'a', 'PRIMARY', 'pressed']]);
  });

  it('a button HELD across a boundary is not acted on in the new context (the press that chose Resume is not a slash)', () => {
    const r = rig();
    r.context('PAUSED');
    r.press('a', 'PRIMARY'); // SELECT → the console resumes: the host switches context in response
    r.context('GAMEPLAY');
    expect(r.game).toEqual([]);
    r.release('a', 'PRIMARY'); // the release closes the old press and is never a game event
    expect(r.game).toEqual([]);
    r.press('a', 'PRIMARY'); // a new, deliberate press IS a slash
    expect(r.game).toEqual([['action', 'a', 'PRIMARY', 'pressed']]);
  });

  it('THROW (back) and DASH held across the boundary do not throw or dash either', () => {
    const r = rig();
    r.context('PAUSED');
    r.press('a', 'SECONDARY');
    r.press('a', 'TERTIARY');
    r.context('GAMEPLAY');
    r.release('a', 'SECONDARY');
    r.release('a', 'TERTIARY');
    expect(r.game).toEqual([]);
  });

  it('GAMEPLAY → PAUSED: a held game button is released for the game and its later release is dropped; the stick stops', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.move('a', 1, 0);
    r.press('a', 'PRIMARY');
    r.game.length = 0;
    r.context('PAUSED');
    expect(r.game).toEqual([
      ['action', 'a', 'PRIMARY', 'released'], // the game's own held state is closed out
      ['move', 'a', 0, 0], // and nobody keeps running
    ]);
    r.game.length = 0;
    r.release('a', 'PRIMARY');
    expect(r.game).toEqual([]);
    expect(r.menu).toEqual([]); // that release is not a menu action either
  });

  it('a stick held through a boundary must return to neutral before it counts (gameplay → menu → gameplay)', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.move('a', 1, 0);
    r.context('PAUSED');
    r.move('a', 1, 0); // still held: neither navigation nor movement
    expect(r.menu).toEqual([]);
    r.context('GAMEPLAY');
    r.game.length = 0;
    r.move('a', 1, 0);
    expect(r.game).toEqual([['move', 'a', 0, 0]]); // reads as neutral, not as a run to the right
    r.move('a', 0, 0);
    r.move('a', 0.8, 0);
    expect(r.game.at(-1)).toEqual(['move', 'a', 0.8, 0]); // neutral seen: it counts again
  });

  it('a stick held while a menu opens does not navigate until it has been neutral', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.move('a', 0, 1);
    r.context('CONSOLE');
    r.move('a', 0, 1);
    expect(r.menu).toEqual([]);
    r.move('a', 0, 0);
    r.move('a', 0, 1);
    expect(r.menu).toEqual([['down', 'a']]);
  });

  it('setting the context it already has changes nothing (no spurious latch)', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.move('a', 1, 0);
    r.context('GAMEPLAY');
    r.move('a', 1, 0);
    expect(r.game.at(-1)).toEqual(['move', 'a', 1, 0]);
  });
});

describe('simultaneous controllers share one focus, deterministically', () => {
  it('navigation from several phones is serialized: steps closer together than the gap collapse to the first', () => {
    const r = rig({ navGapMs: 90, pressGapMs: 0 });
    r.context('CONSOLE');
    r.at(1000);
    r.move('a', 0, 1);
    r.at(1030);
    r.move('b', 0, 1); // 30 ms later: the same intent, not a second step
    r.at(1200);
    r.move('c', 1, 0);
    expect(r.menu).toEqual([
      ['down', 'a'],
      ['right', 'c'],
    ]);
  });

  it('two phones pressing SLASH together select once; a later press selects again', () => {
    const r = rig({ navGapMs: 0, pressGapMs: 250 });
    r.context('CONSOLE');
    r.at(1000);
    r.press('a', 'PRIMARY');
    r.at(1040);
    r.press('b', 'PRIMARY');
    r.at(1400);
    r.press('c', 'PRIMARY');
    expect(r.menu).toEqual([
      ['select', 'a'],
      ['select', 'c'],
    ]);
  });

  it('players are independent in GAMEPLAY: one phone’s hold never affects another’s', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.press('a', 'PRIMARY');
    r.context('GAMEPLAY');
    r.press('b', 'PRIMARY');
    expect(r.game.filter((g) => g[0] === 'action')).toHaveLength(2);
  });
});

describe('stale and duplicate input', () => {
  it('rejects a movement whose sequence is not newer (per player)', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.move('a', 0.1, 0, 10);
    r.move('a', 0.9, 0, 9); // late arrival
    r.move('a', 0.8, 0, 10); // repeat
    r.move('b', 0.3, 0, 1); // another player has its own stream
    expect(r.game).toEqual([
      ['move', 'a', 0.1, 0],
      ['move', 'b', 0.3, 0],
    ]);
  });

  it('a player who reconnects starts a new stream: their sequence may begin again', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.move('a', 0.1, 0, 500);
    r.router.playerGone('a');
    r.move('a', 0.4, 0, 1);
    expect(r.game.at(-1)).toEqual(['move', 'a', 0.4, 0]);
  });

  it('deduplicates an action event id (a retried press never acts twice), in every context', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.press('a', 'PRIMARY', 'same-event-id');
    r.press('a', 'PRIMARY', 'same-event-id');
    expect(r.game.filter((g) => g[0] === 'action')).toHaveLength(1);
    r.release('a', 'PRIMARY');
    r.context('CONSOLE');
    r.press('a', 'PRIMARY', 'menu-event-1');
    r.press('a', 'PRIMARY', 'menu-event-1');
    expect(r.menu).toEqual([['select', 'a']]);
  });

  it('remembers only a bounded window of ids (a long session does not grow without limit)', () => {
    const r = rig();
    r.context('GAMEPLAY');
    for (let i = 0; i < 500; i += 1) {
      r.press('a', 'PRIMARY', `evt-${String(i).padStart(6, '0')}`);
      r.release('a', 'PRIMARY');
    }
    expect(r.router.trackedEventIds('a')).toBeLessThanOrEqual(128);
    r.press('a', 'PRIMARY', 'evt-000499'); // a recent id is still known: this retry is ignored
    expect(r.game.filter((g) => g[0] === 'action' && g[3] === 'pressed')).toHaveLength(500);
  });
});

describe('repeat is driven by tick() and respects the context', () => {
  it('a held stick repeats in the console and stops when the context becomes gameplay', () => {
    const r = rig();
    r.context('CONSOLE');
    r.at(0);
    r.move('a', 0, 1);
    r.at(400);
    r.router.tick(400);
    expect(r.menu.map(([a]) => a)).toEqual(['down', 'down']);
    r.at(450);
    r.context('GAMEPLAY');
    r.at(800);
    r.router.tick(800);
    expect(r.menu).toHaveLength(2);
  });

  it('a player who leaves stops repeating', () => {
    const r = rig();
    r.context('CONSOLE');
    r.at(0);
    r.move('a', 1, 0);
    r.router.playerGone('a');
    r.router.tick(1000);
    expect(r.menu).toEqual([['right', 'a']]);
  });
});

describe('the phone’s PAUSE button (the system MENU action)', () => {
  it('in GAMEPLAY it asks for the pause menu, and never reaches the game or the console focus', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.press('a', 'MENU');
    r.release('a', 'MENU');
    expect(r.system).toEqual([['MENU', 'a']]);
    expect(r.game).toEqual([]);
    expect(r.menu).toEqual([]);
  });

  it('is heard in every context (the console decides what it means there), still never as a menu press', () => {
    for (const context of ['CONSOLE', 'PAUSED', 'RESULTS'] as const) {
      const r = rig();
      r.context(context);
      r.press('b', 'MENU');
      expect(r.system).toEqual([['MENU', 'b']]);
      expect(r.menu).toEqual([]);
    }
  });

  it('the press that opened the pause menu is not a second toggle: it must be released and pressed again', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.press('a', 'MENU');
    r.context('PAUSED'); // the console opened the pause menu
    r.press('a', 'MENU', 'same-hold-repeat'); // a duplicate "pressed" while still held
    expect(r.system).toEqual([['MENU', 'a']]);
    r.release('a', 'MENU');
    r.press('a', 'MENU');
    expect(r.system).toEqual([
      ['MENU', 'a'],
      ['MENU', 'a'],
    ]);
  });

  it('two phones pressing PAUSE together toggle once (no pause-then-instantly-resume)', () => {
    const r = rig({ navGapMs: 0, pressGapMs: 220 });
    r.context('GAMEPLAY');
    r.at(1_000);
    r.press('a', 'MENU');
    r.at(1_050);
    r.press('b', 'MENU');
    expect(r.system).toEqual([['MENU', 'a']]);
    r.release('b', 'MENU');
    r.at(1_400);
    r.press('b', 'MENU', 'later');
    expect(r.system).toEqual([
      ['MENU', 'a'],
      ['MENU', 'b'],
    ]);
  });

  it('a retried PAUSE (same event id) never toggles twice', () => {
    const r = rig();
    r.context('GAMEPLAY');
    r.press('a', 'MENU', 'retry-1');
    r.release('a', 'MENU', 'rel-1');
    r.press('a', 'MENU', 'retry-1');
    expect(r.system).toEqual([['MENU', 'a']]);
  });
});
