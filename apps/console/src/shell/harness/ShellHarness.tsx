import { useMemo, useState } from 'react';
import { SLOT_STYLES } from '../../runtime/slots';
import { CHARACTER_BY_SEAT } from '../components/Characters';
import { ConsoleApp, type InitialView, type Screen } from '../ConsoleApp';
import type { RoomPhase, SeatView, ShellActions, ShellModel } from '../model';
import { ShellRoot } from '../ShellRoot';

/*
 * UI HARNESS — fixtures only. This is NOT the product: it exists to develop and photograph the
 * shell's screens in isolation (no server, no session). The real console builds the same
 * `ShellModel` from the live session (adapter/). Open /harness.html on the dev server.
 *
 *   ?screen=home|detail|settings|join   &join=loading|ready|reconnecting   &seats=default|empty|full
 *   &category=display|accessibility|…   &sheet=howto|…
 */

interface FixtureSeat {
  readonly kind: 'phone' | 'cpu' | 'empty';
  readonly id?: string;
  readonly name?: string;
  readonly status?: 'connected' | 'reconnecting';
  readonly difficulty?: 'Easy' | 'Medium' | 'Hard';
}

const E: FixtureSeat = { kind: 'empty' };
const SEATS: Record<string, readonly FixtureSeat[]> = {
  default: [
    { kind: 'phone', id: 'p1', name: 'Maya', status: 'connected' },
    { kind: 'phone', id: 'p2', name: 'Theo', status: 'connected' },
    { kind: 'phone', id: 'p3', name: 'Jun', status: 'reconnecting' },
    { kind: 'cpu', id: 'c1', name: 'CPU 1', difficulty: 'Medium' },
    E,
    E,
  ],
  empty: [E, E, E, E, E, E],
  full: [
    { kind: 'phone', id: 'p1', name: 'Maya', status: 'connected' },
    { kind: 'phone', id: 'p2', name: 'Theo', status: 'connected' },
    { kind: 'phone', id: 'p3', name: 'Jun', status: 'connected' },
    { kind: 'phone', id: 'p4', name: 'Rosa', status: 'connected' },
    { kind: 'cpu', id: 'c1', name: 'CPU 1', difficulty: 'Hard' },
    { kind: 'cpu', id: 'c2', name: 'CPU 2', difficulty: 'Easy' },
  ],
};
const LEVELS = ['Easy', 'Medium', 'Hard'] as const;
const SCREENS: readonly Screen[] = ['home', 'detail', 'settings', 'join'];

function parse(search: string): { initial: InitialView; seats: string; join: string } {
  const q = new URLSearchParams(search);
  const screen = SCREENS.find((s) => s === q.get('screen'));
  const sheet = q.get('sheet');
  return {
    initial: {
      ...(screen ? { screen } : {}),
      ...(sheet ? { sheet: sheet as never } : {}),
      ...(q.get('category') ? { category: q.get('category') as never } : {}),
    },
    seats: q.get('seats') ?? 'default',
    join: q.get('join') ?? 'ready',
  };
}

export function ShellHarness({ search = window.location.search }: { readonly search?: string }) {
  const parsed = useMemo(() => parse(search), [search]);
  const [seats, setSeats] = useState<readonly FixtureSeat[]>(
    SEATS[parsed.seats] ?? SEATS['default'] ?? [],
  );
  const phase: RoomPhase =
    parsed.join === 'reconnecting'
      ? 'reconnecting'
      : parsed.join === 'loading'
        ? 'opening'
        : 'open';
  const [opened, setOpened] = useState(parsed.initial.screen === 'join');
  const live = opened && phase !== 'opening';

  const model = useMemo<ShellModel>(() => {
    const views: SeatView[] = seats.map((s, slot) => {
      const style = SLOT_STYLES[slot] ??
        SLOT_STYLES[0] ?? { color: '#fff', number: slot + 1, marker: '●' };
      return {
        slot,
        color: style.color,
        number: style.number,
        marker: style.marker,
        kind: s.kind,
        ...(s.id ? { id: s.id } : {}),
        ...(s.name ? { name: s.name } : {}),
        ...(s.kind !== 'empty' ? { character: CHARACTER_BY_SEAT[slot] ?? 'bread' } : {}),
        status: s.status ?? 'connected',
        ...(s.difficulty ? { detail: s.difficulty } : {}),
      };
    });
    const participants = seats.filter((s) => s.kind !== 'empty').length;
    const connected = seats.filter((s) => s.kind !== 'empty' && s.status !== 'reconnecting').length;
    const canStart = phase === 'open' && connected >= 2;
    return {
      gameId: 'foomerang-fu',
      room: {
        phase: live ? phase : opened ? 'opening' : 'none',
        code: 'K7QF2M',
        joinUrl: 'http://192.168.1.20:5173/?room=K7QF2M',
        shortAddress: '192.168.1.20:5173',
        seats: views,
        waitingForSeat: [],
        participants,
        phones: seats.filter((s) => s.kind === 'phone').length,
        canStart,
        startBlockedReason: canStart
          ? undefined
          : 'At least 2 players are needed. Invite a friend or add a CPU.',
        launching: false,
        canAddCpu: participants < 6,
        interrupted: false,
      },
      warnings: [],
      facts: {
        connection: 'Good',
        phoneAddress: '192.168.1.20:5173',
        version: '0.1',
        build: 'Harness',
      },
    };
  }, [seats, phase, live, opened]);

  const actions = useMemo<ShellActions>(
    () => ({
      openRoom: () => setOpened(true),
      closeRoom: () => setOpened(false),
      start: () => undefined,
      stepBots: () => undefined,
      addCpu: () =>
        setSeats((prev) => {
          const at = prev.findIndex((s) => s.kind === 'empty');
          return at < 0
            ? prev
            : prev.map((s, i) =>
                i === at
                  ? { kind: 'cpu', id: `c${at}`, name: `CPU ${at}`, difficulty: 'Medium' }
                  : s,
              );
        }),
      removeCpu: (id) => setSeats((prev) => prev.map((s) => (s.id === id ? E : s))),
      stepCpu: (id, delta) =>
        setSeats((prev) =>
          prev.map((s) => {
            if (s.id !== id || !s.difficulty) return s;
            const next =
              LEVELS[Math.min(2, Math.max(0, LEVELS.indexOf(s.difficulty) + delta))] ?? 'Medium';
            return { ...s, difficulty: next };
          }),
        ),
      dismissFailure: () => undefined,
    }),
    [],
  );

  return (
    <ShellRoot>
      <ConsoleApp model={model} actions={actions} initial={parsed.initial} />
    </ShellRoot>
  );
}
