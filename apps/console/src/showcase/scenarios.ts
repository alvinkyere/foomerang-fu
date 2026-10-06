import {
  FREE_FOR_ALL,
  GARDEN_ARENA,
  createFuMatch,
  type FuPlayerInput,
  type FuState,
  type PowerKind,
} from '@foomerang/foomerang-fu';

/**
 * DEVELOPMENT ONLY. Scripted situations played through the REAL rules (`stepFu`) and drawn by the REAL renderer, so a
 * frame of the game can be set beside a frame of the reference video at an equivalent moment. Nothing here is shipped
 * (the production build has no entry for it), and nothing here changes a rule: it only places people, owns powers and
 * presses buttons, exactly as players could.
 */
export interface Scenario {
  readonly name: string;
  readonly about: string;
  readonly seconds: number;
  readonly players: readonly string[];
  readonly setup: (s: FuState) => FuState;
  readonly inputs: (tick: number, s: FuState) => Readonly<Record<string, FuPlayerInput>>;
}

const move = (x: number, y: number): FuPlayerInput => ({ move: { x, y } });
const at = (s: FuState, id: string) => {
  const b = s.world.bodies.find((q) => q.id === id);
  return b?.position ?? { x: 0, y: 0 };
};

export function place(s: FuState, id: string, x: number, y: number): FuState {
  return {
    ...s,
    world: {
      ...s.world,
      bodies: s.world.bodies.map((b) => (b.id === id ? { ...b, position: { x, y } } : b)),
    },
    boomerangs: s.boomerangs.map((b) =>
      b.ownerId === id && b.state === 'HELD' ? { ...b, position: { x, y } } : b,
    ),
    extraBoomerangs: s.extraBoomerangs.map((b) =>
      b.ownerId === id && b.state === 'HELD' ? { ...b, position: { x, y } } : b,
    ),
  };
}
export const face = (s: FuState, id: string, x: number, y: number): FuState => ({
  ...s,
  players: s.players.map((p) => (p.id === id ? { ...p, facing: { x, y } } : p)),
});
function own(s: FuState, id: string, ...kinds: PowerKind[]): FuState {
  const twin =
    kinds.includes('TWIN_THROW') && !s.extraBoomerangs.some((b) => b.ownerId === id)
      ? [
          ...s.extraBoomerangs,
          { ...(s.boomerangs.find((b) => b.ownerId === id) as FuState['boomerangs'][number]) },
        ]
      : s.extraBoomerangs;
  return {
    ...s,
    players: s.players.map((p) => (p.id === id ? { ...p, inventory: kinds } : p)),
    extraBoomerangs: twin,
  };
}

/** The open room in the middle of Garden (x 930–1300, y 560–880): nothing but floor. */
const ROOM = { x: 1100, y: 700 };
const ids2 = ['a', 'b'] as const;

export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'idle',
    about: 'neutral arena, two players standing',
    seconds: 2,
    players: ids2,
    setup: (s) =>
      face(place(place(s, 'a', ROOM.x - 120, ROOM.y), 'b', ROOM.x + 120, ROOM.y), 'b', -1, 0),
    inputs: () => ({}),
  },
  {
    name: 'run',
    about: 'idle → run → stop (a), a diagonal dash of running (b)',
    seconds: 2.2,
    players: ids2,
    setup: (s) => place(place(s, 'a', ROOM.x - 200, ROOM.y), 'b', ROOM.x + 160, ROOM.y - 100),
    inputs: (t) => ({
      a: t > 20 && t < 80 ? move(1, 0) : {},
      b: t > 30 && t < 110 ? move(-0.7, 0.7) : {},
    }),
  },
  {
    name: 'turn',
    about: 'running, then a sharp change of direction',
    seconds: 2.2,
    players: ids2,
    setup: (s) => place(place(s, 'a', ROOM.x - 200, ROOM.y), 'b', ROOM.x + 200, ROOM.y + 120),
    inputs: (t) => ({ a: t < 40 ? move(1, 0) : t < 90 ? move(0, -1) : {}, b: {} }),
  },
  {
    name: 'dash',
    about: 'run → DASH → recovery',
    seconds: 2,
    players: ids2,
    setup: (s) => place(place(s, 'a', ROOM.x - 220, ROOM.y), 'b', ROOM.x + 200, ROOM.y + 140),
    inputs: (t) => ({
      a: t < 30 ? move(1, 0) : t === 30 ? { dash: true, move: { x: 1, y: 0 } } : {},
    }),
  },
  {
    name: 'slash',
    about: 'a SLASH with nobody in reach',
    seconds: 1.6,
    players: ids2,
    setup: (s) =>
      face(place(place(s, 'a', ROOM.x - 60, ROOM.y), 'b', ROOM.x + 260, ROOM.y + 150), 'a', 1, 0),
    inputs: (t) => ({ a: t === 18 ? { slash: true } : {} }),
  },
  {
    name: 'slash-kill',
    about: 'a SLASH that kills (close combat), 3 players',
    seconds: 2.4,
    players: ['a', 'b', 'c'],
    setup: (s) =>
      face(
        place(
          place(place(s, 'a', ROOM.x - 60, ROOM.y), 'b', ROOM.x + 50, ROOM.y),
          'c',
          ROOM.x + 240,
          ROOM.y + 160,
        ),
        'a',
        1,
        0,
      ),
    inputs: (t) => ({ a: t === 18 ? { slash: true } : {} }),
  },
  {
    name: 'throw',
    about: 'THROW → outbound → RETURNING → catch (nobody hit)',
    seconds: 3,
    players: ids2,
    setup: (s) =>
      face(place(place(s, 'a', ROOM.x - 180, ROOM.y), 'b', ROOM.x + 150, ROOM.y + 250), 'a', 1, 0),
    inputs: (t) => ({ a: t === 18 ? { throw: true, move: { x: 1, y: 0 } } : {} }),
  },
  {
    name: 'hit-death',
    about: 'a boomerang kills b: impact and death',
    seconds: 3,
    players: ids2,
    setup: (s) =>
      face(place(place(s, 'a', ROOM.x - 220, ROOM.y), 'b', ROOM.x + 120, ROOM.y), 'a', 1, 0),
    inputs: (t) => ({ a: t === 18 ? { throw: true, move: { x: 1, y: 0 } } : {} }),
  },
  {
    name: 'deflect',
    about: 'b throws, a deflects with a timed SLASH',
    seconds: 3,
    players: ids2,
    setup: (s) =>
      face(
        face(place(place(s, 'a', ROOM.x - 120, ROOM.y), 'b', ROOM.x + 240, ROOM.y), 'a', 1, 0),
        'b',
        -1,
        0,
      ),
    inputs: (t, s) => {
      const bm = s.boomerangs.find((q) => q.ownerId === 'b');
      const me = at(s, 'a');
      const close =
        bm?.state === 'THROWN' && Math.hypot(bm.position.x - me.x, bm.position.y - me.y) < 150;
      return {
        b: t === 12 ? { throw: true, move: { x: -1, y: 0 } } : {},
        a: close ? { slash: true } : {},
      };
    },
  },
  {
    name: 'twin',
    about: 'TWIN_THROW: two boomerangs from one press',
    seconds: 3,
    players: ids2,
    setup: (s) =>
      own(
        face(
          place(place(s, 'a', ROOM.x - 200, ROOM.y), 'b', ROOM.x + 150, ROOM.y + 250),
          'a',
          1,
          0,
        ),
        'a',
        'TWIN_THROW',
      ),
    inputs: (t) => ({ a: t === 18 ? { throw: true, move: { x: 1, y: 0 } } : {} }),
  },
  {
    name: 'blast',
    about: 'BLAST_BOOMERANG explodes on a victim',
    seconds: 3,
    players: ['a', 'b', 'c'],
    setup: (s) =>
      own(
        face(
          place(
            place(place(s, 'a', ROOM.x - 220, ROOM.y), 'b', ROOM.x + 120, ROOM.y),
            'c',
            ROOM.x + 190,
            ROOM.y + 60,
          ),
          'a',
          1,
          0,
        ),
        'a',
        'BLAST_BOOMERANG',
      ),
    inputs: (t) => ({ a: t === 18 ? { throw: true, move: { x: 1, y: 0 } } : {} }),
  },
  {
    name: 'shield',
    about: 'a SHIELD absorbs a swing and breaks',
    seconds: 2.4,
    players: ids2,
    setup: (s) =>
      own(
        face(place(place(s, 'a', ROOM.x - 60, ROOM.y), 'b', ROOM.x + 50, ROOM.y), 'a', 1, 0),
        'b',
        'GUARD',
      ),
    inputs: (t) => ({ a: t === 24 ? { slash: true } : {} }),
  },
  {
    name: 'phase',
    about: 'PHASE_DASH through a wall',
    seconds: 2.4,
    players: ids2,
    setup: (s) =>
      own(
        face(place(place(s, 'a', 620, 592), 'b', ROOM.x + 200, ROOM.y + 140), 'a', 0, -1),
        'a',
        'PHASE_DASH',
      ),
    inputs: (t) => ({ a: t === 20 ? { dash: true, move: { x: 0, y: -1 } } : {} }),
  },
  {
    name: 'book',
    about: 'a Book on the grass, then taken',
    seconds: 3,
    players: ids2,
    setup: (s) => ({
      ...place(place(s, 'a', 1000, 690), 'b', 1280, 820),
      pickups: [{ id: 1, position: { x: 1180, y: 690 } }],
    }),
    inputs: (t) => ({ a: t > 40 ? move(1, 0) : {} }),
  },
  {
    name: 'six',
    about: 'six players, high action in the middle room',
    seconds: 5,
    players: ['a', 'b', 'c', 'd', 'e', 'f'],
    setup: (s) =>
      ['a', 'b', 'c', 'd', 'e', 'f'].reduce(
        (acc, id, k) =>
          place(
            acc,
            id,
            ROOM.x + Math.cos((k * Math.PI) / 3) * 150,
            ROOM.y + Math.sin((k * Math.PI) / 3) * 110,
          ),
        s,
      ),
    inputs: (t) =>
      Object.fromEntries(
        ['a', 'b', 'c', 'd', 'e', 'f'].map((id, k) => [
          id,
          {
            move: { x: Math.cos(t / (14 + 3 * k) + k), y: Math.sin(t / (17 + 2 * k) + k) },
            ...(t % (47 + 5 * k) === 0 ? { throw: true } : {}),
            ...(t % (61 + 4 * k) === 3 ? { slash: true } : {}),
            ...((t + 9 * k) % 83 === 0 ? { dash: true } : {}),
          },
        ]),
      ),
  },
  {
    name: 'victory',
    about: 'the winning kill: the champion celebrates',
    seconds: 3.4,
    players: ids2,
    setup: (s) => ({
      ...face(place(place(s, 'a', ROOM.x - 60, ROOM.y), 'b', ROOM.x + 50, ROOM.y), 'a', 1, 0),
      scores: { a: 13, b: 0 },
    }),
    inputs: (t) => ({ a: t === 18 ? { slash: true } : {} }),
  },
];

export function startState(scenario: Scenario): FuState {
  const slots = [0, 1, 2, 3, 4, 5];
  const base = createFuMatch(
    scenario.players.map((id, i) => ({ id, slot: slots[i] as number })),
    { arena: GARDEN_ARENA, ...FREE_FOR_ALL },
  );
  return scenario.setup(base);
}
