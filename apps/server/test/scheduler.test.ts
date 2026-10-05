import { describe, expect, it } from 'vitest';
import { realScheduler } from '../src/scheduler';
import { ManualScheduler } from './support/manualScheduler';

describe('ManualScheduler (the test double everything else relies on)', () => {
  it('runs a timeout only once its delay has elapsed', () => {
    const scheduler = new ManualScheduler();
    let fired = 0;
    scheduler.setTimeout(() => (fired += 1), 5_000);
    scheduler.advance(4_999);
    expect(fired).toBe(0);
    scheduler.advance(1);
    expect(fired).toBe(1);
    scheduler.advance(60_000);
    expect(fired).toBe(1); // once only
    expect(scheduler.pending).toBe(0);
  });

  it('repeats an interval and stops when cancelled', () => {
    const scheduler = new ManualScheduler();
    let ticks = 0;
    const cancel = scheduler.setInterval(() => (ticks += 1), 1_000);
    scheduler.advance(3_500);
    expect(ticks).toBe(3);
    cancel();
    scheduler.advance(10_000);
    expect(ticks).toBe(3);
    expect(scheduler.pending).toBe(0);
  });

  it('a cancelled timeout never fires', () => {
    const scheduler = new ManualScheduler();
    let fired = false;
    scheduler.setTimeout(() => (fired = true), 100)();
    scheduler.advance(1_000);
    expect(fired).toBe(false);
  });

  it('runs due timers in time order', () => {
    const scheduler = new ManualScheduler();
    const order: string[] = [];
    scheduler.setTimeout(() => order.push('late'), 300);
    scheduler.setTimeout(() => order.push('early'), 100);
    scheduler.advance(1_000);
    expect(order).toEqual(['early', 'late']);
  });
});

describe('realScheduler', () => {
  it('fires a timeout', async () => {
    await new Promise<void>((resolve) => {
      realScheduler.setTimeout(resolve, 1);
    });
  });

  it('cancelling a timeout prevents it from firing', async () => {
    let fired = false;
    realScheduler.setTimeout(() => (fired = true), 5)();
    await new Promise<void>((resolve) => realScheduler.setTimeout(resolve, 25));
    expect(fired).toBe(false);
  });

  it('repeats an interval until cancelled', async () => {
    let ticks = 0;
    const cancel = realScheduler.setInterval(() => (ticks += 1), 2);
    await new Promise<void>((resolve) => realScheduler.setTimeout(resolve, 30));
    cancel();
    const atCancel = ticks;
    expect(atCancel).toBeGreaterThanOrEqual(2);
    await new Promise<void>((resolve) => realScheduler.setTimeout(resolve, 20));
    expect(ticks).toBe(atCancel);
  });
});
