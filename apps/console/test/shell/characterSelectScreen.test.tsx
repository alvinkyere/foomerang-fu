import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { characterView } from '../../src/characters/videoPalette';
import { FocusManager } from '../../src/shell/focus/FocusManager';
import type { CharacterSelectView } from '../../src/shell/model';
import { CharacterSelectScreen } from '../../src/shell/screens/CharacterSelectScreen';
import { SelectHints } from '../../src/shell/screens/SelectHints';

// game-setting.mp4: the grid's tiles and the big circles show the characters the same way (facing the front, with their hands),
// so a tile shows the character-select still, the first frame of the circle's animation.

const milk = characterView('milk');
const select: CharacterSelectView = {
  seats: [{ slot: 0, number: 1, kind: 'phone', name: 'Al', character: milk, ready: false }],
  grid: [
    [
      { character: characterView('banana'), cursors: [] },
      { character: milk, cursors: [{ number: 1, color: milk.color, ready: false }] },
    ],
  ],
  everyoneReady: false,
  bots: 0,
  canAddBot: false,
};

describe('character select', () => {
  it('shows each character on its tile as its circle does', () => {
    const { container } = render(
      <FocusManager>
        <CharacterSelectScreen
          select={select}
          status="ready"
          canStart={false}
          onBegin={vi.fn()}
          onStepBots={vi.fn()}
          onCpuStep={vi.fn()}
          onCpuRemove={vi.fn()}
          onBack={vi.fn()}
        />
      </FocusManager>,
    );
    const thumbs = [...container.querySelectorAll('.cs__thumb')].map((img) =>
      img.getAttribute('src'),
    );
    expect(thumbs).toEqual([
      'characters/select/banana-still.webp',
      'characters/select/milk-still.webp',
    ]);
    // the circle starts from the same still while its animation loads
    expect(container.querySelector('.cs__circle img')?.getAttribute('src')).toBe(
      'characters/select/milk-still.webp',
    );
  });
});

describe('first-time hints', () => {
  const screenWith = (view: CharacterSelectView) => (
    <FocusManager>
      <CharacterSelectScreen
        select={view}
        status="ready"
        canStart={false}
        onBegin={vi.fn()}
        onStepBots={vi.fn()}
        onCpuStep={vi.fn()}
        onCpuRemove={vi.fn()}
        onBack={vi.fn()}
      />
    </FocusManager>
  );

  it('the screen shows them (fetched apart from the first download)', async () => {
    window.localStorage.clear();
    render(screenWith(select));
    expect((await screen.findByTestId('select-hint', {}, { timeout: 4000 })).textContent).toMatch(
      /CHOOSE.*READY/,
    );
    window.localStorage.clear();
  });

  it('waits before it shows (whoever knows what to do never sees it), and once learned never comes back', async () => {
    vi.useFakeTimers();
    try {
      window.localStorage.clear();
      const { rerender, unmount } = render(<SelectHints select={select} />);
      await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
      expect(screen.queryByTestId('select-hint')).toBeNull();
      await act(async () => void (await vi.advanceTimersByTimeAsync(600)));
      expect(screen.getByTestId('select-hint').textContent).toMatch(/CHOOSE.*READY/);
      // Al gets READY: the hint goes, and it is remembered
      const ready: CharacterSelectView = {
        ...select,
        seats: [{ ...select.seats[0], ready: true } as (typeof select.seats)[0]],
        everyoneReady: true,
        canAddBot: true,
      };
      rerender(<SelectHints select={ready} />);
      await act(async () => void (await vi.advanceTimersByTimeAsync(1600)));
      expect(screen.getByTestId('select-hint').textContent).toMatch(/ADD BOTS/); // the next one: bots
      unmount();
      render(<SelectHints select={select} />);
      await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
      expect(screen.queryByTestId('select-hint')).toBeNull();
    } finally {
      vi.useRealTimers();
      window.localStorage.clear();
    }
  });
});
