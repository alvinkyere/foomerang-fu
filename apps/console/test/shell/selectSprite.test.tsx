import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectSprite } from '../../src/shell/components/SelectSprite';

// The big circle's character on character select plays game-setting.mp4's animation from a pre-rendered sheet: a still until
// the sheet has loaded, then the arrival from the side the cursor came from, then the idle loop, at 30 fps.

let loaded: (() => void)[] = [];
class FakeImage {
  onload: (() => void) | null = null;
  set src(_: string) {
    loaded.push(() => this.onload?.());
  }
}

const position = (el: Element | null): string =>
  (el as HTMLElement | null)?.style.backgroundPosition ?? '';

describe('SelectSprite', () => {
  beforeEach(() => {
    loaded = [];
    vi.stubGlobal('Image', FakeImage);
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the still until its sheet has loaded', () => {
    const { container } = render(<SelectSprite sheet="s.webp" still="still.webp" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('still.webp');
    expect(container.querySelector('.cs__sprite')).toBeNull();
  });

  it('then plays the arrival from the cursor’s side and runs into the idle loop', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // no blinks
    const { container } = render(<SelectSprite sheet="s.webp" still="still.webp" arrival="left" />);
    act(() => loaded.forEach((done) => done()));
    const sprite = container.querySelector('.cs__sprite');
    expect(sprite).not.toBeNull();
    // the left arrival's first frame is frame 40: column 0, row 5 of the 8 x 12 sheet
    expect(position(sprite)).toBe('0% 45.4545%');
    // five frames later (the browser draws every ~16 ms: 186 ms is past the 176 ms draw, still frame 5): the idle loop's start
    act(() => vi.advanceTimersByTime(186));
    expect(position(sprite)).toBe('0% 0%');
    act(() => vi.advanceTimersByTime(1000 / 30));
    expect(position(sprite)).toBe('14.2857% 0%');
  });

  it('cheers when its player readies (the 28-frame cheer from the sheet’s frame 50), then idles again', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // no blinks
    const { container, rerender } = render(
      <SelectSprite sheet="s.webp" still="still.webp" ready={false} />,
    );
    act(() => loaded.forEach((done) => done()));
    act(() => vi.advanceTimersByTime(500));
    rerender(<SelectSprite sheet="s.webp" still="still.webp" ready />);
    act(() => vi.advanceTimersByTime(20));
    // frame 50: column 2, row 6 of the 8 x 12 sheet
    expect(position(container.querySelector('.cs__sprite'))).toBe('28.5714% 54.5455%');
    act(() => vi.advanceTimersByTime(1000));
    // 1 s after readying (30 frames): the cheer is over, two frames into the idle loop
    expect(position(container.querySelector('.cs__sprite'))).toBe('28.5714% 0%');
  });

  it('does not cheer when it first appears already ready (a reload, a returning player)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { container } = render(<SelectSprite sheet="s.webp" still="still.webp" ready />);
    act(() => loaded.forEach((done) => done()));
    expect(position(container.querySelector('.cs__sprite'))).toBe('0% 0%');
  });

  it('holds still when the viewer asked for less motion', () => {
    document.documentElement.dataset['reducedMotion'] = 'true';
    try {
      const { container } = render(
        <SelectSprite sheet="s.webp" still="still.webp" arrival="right" />,
      );
      act(() => loaded.forEach((done) => done()));
      act(() => vi.advanceTimersByTime(500));
      expect(container.querySelector('.cs__sprite')).toBeNull();
      expect(container.querySelector('img')?.getAttribute('src')).toBe('still.webp');
    } finally {
      delete document.documentElement.dataset['reducedMotion'];
    }
  });
});
