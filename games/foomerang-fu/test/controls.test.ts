import { describe, expect, it } from 'vitest';
import { FU_BUTTONS, FU_CONTROLS } from '../src';

describe('Foomerang Fu’s controller contract (one definition, shared by everyone who needs it)', () => {
  it('is MOVE (joystick), SLASH (button) and THROW (button), in that order', () => {
    expect(FU_CONTROLS.map((c) => [c.id, c.type])).toEqual([
      ['MOVE', 'joystick'],
      ['SLASH', 'button'],
      ['THROW', 'button'],
    ]);
  });

  it('gives SLASH and THROW different generic actions (the platform forbids two buttons sharing one)', () => {
    expect(FU_BUTTONS.SLASH).not.toBe(FU_BUTTONS.THROW);
  });

  it('advertises exactly the action each button is defined to mean', () => {
    for (const control of FU_CONTROLS) {
      if (control.type === 'button') expect(control.action).toBe(FU_BUTTONS[control.id as 'SLASH']);
    }
  });
});
