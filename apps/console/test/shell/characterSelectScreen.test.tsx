import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { characterView } from '../../src/characters/videoPalette';
import { FocusManager } from '../../src/shell/focus/FocusManager';
import type { CharacterSelectView } from '../../src/shell/model';
import { CharacterSelectScreen } from '../../src/shell/screens/CharacterSelectScreen';

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
