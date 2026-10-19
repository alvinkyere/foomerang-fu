import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { FU_MANIFEST, FakeSession, READY } from './support/fakeSession';

// The TV makes this phone feel it (a player outside the plaza's border): Android vibrates, harder and longer as the
// strength rises; an iPhone (no web vibration) shows a red pulse over the controls at the same strength instead.

const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
afterEach(() => {
  if (original) Object.defineProperty(navigator, 'vibrate', original);
  else delete (navigator as unknown as Record<string, unknown>)['vibrate'];
  vi.useRealTimers();
});

function playing() {
  const session = new FakeSession({ ...READY, manifest: FU_MANIFEST });
  render(<App session={session} initialRoom={undefined} />);
  return session;
}

describe('rumble on the phone', () => {
  it('where the phone can vibrate, a rumble vibrates it for its duration (a stronger one longer)', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const session = playing();
    act(() => session.rumble(0.3, 200));
    act(() => session.rumble(1, 600));
    expect(vibrate).toHaveBeenCalledTimes(2);
    const [weak] = vibrate.mock.calls[0] as unknown as [number | number[]];
    const [strong] = vibrate.mock.calls[1] as unknown as [number | number[]];
    const total = (p: number | number[]) =>
      Array.isArray(p) ? p.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) : p;
    expect(total(strong)).toBeGreaterThan(total(weak));
    expect(total(strong)).toBeLessThanOrEqual(600);
    expect(screen.queryByTestId('rumble-pulse')).toBeNull();
  });

  it('where it cannot (iPhone), a rumble shows a red pulse at its strength, which fades', () => {
    delete (navigator as unknown as Record<string, unknown>)['vibrate'];
    vi.useFakeTimers();
    const session = playing();
    act(() => session.rumble(0.8, 300));
    const pulse = screen.getByTestId('rumble-pulse');
    expect(Number(pulse.dataset['strength'])).toBeCloseTo(0.8, 5);
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.queryByTestId('rumble-pulse')).toBeNull();
  });
});
