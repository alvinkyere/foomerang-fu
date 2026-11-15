import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FocusManager } from '../src/shell/focus/FocusManager';
import { ControlsCard } from '../src/ui/ControlsCard';

// The CONTROLS card (ff physics hq 2.mp4 9:53) shows OUR controls as the phone draws them, never a gamepad's coloured
// buttons (owner, 2026-11-14): the stick for MOVE, and the phone's own SLASH, THROW and DASH buttons with their words.
describe('the CONTROLS card', () => {
  it('draws the phone’s stick and its three buttons, each in the phone’s own look', () => {
    const { container } = render(
      <FocusManager>
        <ControlsCard onContinue={vi.fn()} />
      </FocusManager>,
    );
    const rows = [...container.querySelectorAll('.cc__row')];
    expect(rows.map((r) => r.textContent)).toEqual(['MOVE', 'DASH', 'SLASH', 'THROW']);
    expect(rows[0]?.querySelector('.cc__button--move')?.textContent).toBe('MOVE'); // the stick's pad
    expect(rows[1]?.querySelector('.cc__button--dash')?.textContent).toBe('DASH');
    expect(rows[2]?.querySelector('.cc__button--slash')?.textContent).toBe('SLASH');
    expect(rows[3]?.querySelector('.cc__button--throw')?.textContent).toBe('THROW');
    expect(container.querySelector('.cc__glyph')).toBeNull(); // no gamepad-style coloured discs
  });
});
