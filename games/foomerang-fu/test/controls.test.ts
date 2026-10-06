import { describe, expect, it } from 'vitest';
import { FU_BUTTONS, FU_CONTROLS } from '../src';

describe('Foomerang Fu’s controller contract (one definition, shared by everyone who needs it)', () => {
  it('is MOVE (joystick), SLASH, THROW and DASH (buttons), in that order', () => {
    expect(FU_CONTROLS.map((c) => [c.id, c.type])).toEqual([
      ['MOVE', 'joystick'],
      ['SLASH', 'button'],
      ['THROW', 'button'],
      ['DASH', 'button'],
    ]);
  });

  it('gives every button a different generic action (the platform forbids two buttons sharing one)', () => {
    const actions = Object.values(FU_BUTTONS);
    expect(new Set(actions).size).toBe(actions.length);
    expect(FU_BUTTONS).toEqual({ SLASH: 'PRIMARY', THROW: 'SECONDARY', DASH: 'TERTIARY' });
  });

  it('advertises exactly the action each button is defined to mean', () => {
    for (const control of FU_CONTROLS) {
      if (control.type === 'button') expect(control.action).toBe(FU_BUTTONS[control.id as 'SLASH']);
    }
  });
});
