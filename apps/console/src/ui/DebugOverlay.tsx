import { useEffect, useState } from 'react';
import type { ConsoleRuntime } from '../consoleRuntime';

const fmt = (value: number | undefined, digits = 1, unit = ''): string =>
  value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}${unit}`;

/**
 * Engineering numbers, and only ones that are actually measured. "—" means NOT MEASURED, never zero.
 *
 * Every time here comes from this device's own clock. There is deliberately no "controller → screen
 * latency" figure: that would need two devices' clocks to agree, and they do not. The round trip is
 * the console's own heartbeat to the server (request and response timed on one clock).
 */
export function DebugOverlay({ runtime }: { readonly runtime: ConsoleRuntime }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const m = runtime.director.runtime.metrics();
  const d = runtime.session.diagnostics();
  const rows: [string, string][] = [
    ['FPS (rendered frames)', fmt(m.fps, 0)],
    ['Frame time mean / max', `${fmt(m.frameMs, 1)} / ${fmt(m.frameMaxMs, 1)} ms`],
    ['Simulation steps', String(m.simulationSteps)],
    ['Catch-up frames (>1 step)', String(m.catchUpFrames)],
    [
      'Discarded simulation time',
      `${fmt(m.discardedSimulationMs, 0)} ms in ${m.discardEvents} frame(s)`,
    ],
    ['Stale input → neutral', String(m.staleNeutralizations)],
    [
      'Host receive → sim step',
      `${fmt(m.inputToSim.lastMs, 1)} last / ${fmt(m.inputToSim.meanMs, 1)} mean / ${fmt(m.inputToSim.maxMs, 1)} max ms (n=${m.inputToSim.samples})`,
    ],
    ['Console ⇄ server round trip', fmt(d.rttMs, 0, ' ms')],
    ['Movement messages received', String(d.movementReceived)],
    ['Console reconnects', String(d.reconnects)],
    ['Players in match', String(m.players)],
  ];

  return (
    <aside className="debug" aria-label="Debug overlay">
      <h2>Debug</h2>
      <dl>
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        Times are this device’s own clock. “Host receive → sim step” is not network latency and not
        input-to-photon latency. “—” means not measured.
      </p>
    </aside>
  );
}
