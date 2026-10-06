import { FU_BUTTONS, FU_CONTROLS } from '@foomerang/foomerang-fu';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HostClient, newController, startStack, type Stack } from './support/harness';

/**
 * The server advertises Foomerang Fu's buttons and the console decides what each one MEANS. The
 * server must stay game-agnostic (it may not import the game package), so the two tables are two
 * copies — and THIS is what keeps them from drifting apart: the REAL server's manifest against the
 * game's own contract. (A THROW button once arrived as a SLASH because a stale server still
 * advertised the old pairing; see docs/FOOMERANG_FU.md.)
 */
let stack: Stack;
beforeEach(async () => {
  stack = await startStack();
});
afterEach(async () => {
  await stack.server.stop();
});

describe('the server and the game agree on Foomerang Fu’s controls', () => {
  it('the manifest a real controller receives is exactly the game’s FU_CONTROLS', async () => {
    const host = await HostClient.create(stack.url);
    const controller = newController(stack.url);
    controller.session.join(host.joinCode, 'Alice');
    await controller.waitForPhase('READY');
    expect(controller.session.getState().manifest?.controls).toEqual([...FU_CONTROLS]);
    host.close();
  });

  it('every button the server advertises is one the game knows, with the action the game gave it', async () => {
    const host = await HostClient.create(stack.url);
    const controller = newController(stack.url);
    controller.session.join(host.joinCode, 'Alice');
    await controller.waitForPhase('READY');
    const buttons = (controller.session.getState().manifest?.controls ?? []).flatMap((c) =>
      c.type === 'button' ? [c] : [],
    );
    expect(buttons.map((b) => b.id).sort()).toEqual(Object.keys(FU_BUTTONS).sort());
    for (const button of buttons) {
      expect(button.action, button.id).toBe(FU_BUTTONS[button.id as keyof typeof FU_BUTTONS]);
    }
    host.close();
  });
});
