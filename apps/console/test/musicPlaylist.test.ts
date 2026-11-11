import { describe, expect, it } from 'vitest';
import {
  FADE,
  MATCH_TRACKS,
  MENU_TRACKS,
  Playlist,
  TRACKS,
  crossfade,
  trackVolume,
} from '../src/audio/playlist';

// The game's music (owner, 2026-11-11: "use them to be the game's audio ... get these tracks rotated in the game, make sure
// they transition well"): the owner's six tracks, the theme and Ready Up in the menus, the four others rotating in matches.

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length] as number;
};

describe('the tracks', () => {
  it('are the six the owner gave, each where its music stops and leveled to the quietest', () => {
    expect(TRACKS).toHaveLength(6);
    for (const t of TRACKS) {
      expect(t.file).toMatch(/^audio\/music\/[a-z-]+\.mp3$/);
      expect(t.end).toBeGreaterThan(120);
      expect(t.gain).toBeGreaterThan(0.5);
      expect(t.gain).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...TRACKS.map((t) => t.gain))).toBe(1); // (the quietest plays as it is)
  });

  it('the theme and Ready Up are the menus’; the other four are the matches’', () => {
    expect(MENU_TRACKS.map((t) => t.id)).toEqual(['theme', 'ready-up']);
    expect(MATCH_TRACKS.map((t) => t.id).sort()).toEqual(
      ['banana-split', 'sliced-bread', 'smashed-avo', 'spilt-milk'].sort(),
    );
  });
});

describe('the rotation', () => {
  it('the menus open on the theme, then take turns with Ready Up', () => {
    const p = new Playlist(seq(0.3));
    expect(['menu', 'menu', 'menu', 'menu'].map(() => p.next('menu').id)).toEqual([
      'theme',
      'ready-up',
      'theme',
      'ready-up',
    ]);
  });

  it('matches play every one of their four before any comes back, never the same twice running', () => {
    for (const r of [seq(0), seq(0.99), seq(0.5, 0.1, 0.9, 0.3, 0.7)]) {
      const p = new Playlist(r);
      const played = Array.from({ length: 24 }, () => p.next('match').id);
      for (let i = 0; i < 24; i += 4) expect(new Set(played.slice(i, i + 4)).size).toBe(4);
      for (let i = 1; i < 24; i += 1) expect(played[i]).not.toBe(played[i - 1]);
    }
  });

  it('the menus’ and the matches’ turns are their own', () => {
    const p = new Playlist(seq(0.4));
    p.next('match');
    expect(p.next('menu').id).toBe('theme');
  });
});

describe('the crossfade', () => {
  it('is equal-power: the outgoing falls as the incoming rises, the sum of their powers stays 1', () => {
    for (const u of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      const { out, into } = crossfade(u);
      expect(out ** 2 + into ** 2).toBeCloseTo(1, 6);
    }
    expect(crossfade(0)).toEqual({ out: 1, into: 0 });
    expect(crossfade(1).into).toBeCloseTo(1);
    expect(crossfade(1).out).toBeCloseTo(0);
    expect(crossfade(-1)).toEqual(crossfade(0));
    expect(crossfade(2)).toEqual(crossfade(1));
  });

  it('a track ending hands over over several seconds; a screen change more quickly', () => {
    expect(FADE.track).toBeGreaterThanOrEqual(3);
    expect(FADE.scene).toBeGreaterThan(0.5);
    expect(FADE.scene).toBeLessThan(FADE.track);
  });

  it('a track’s volume is the music level times its leveling times the fade, never over 1', () => {
    const loud = TRACKS.reduce((a, b) => (a.gain < b.gain ? a : b));
    const quiet = TRACKS.find((t) => t.gain === 1);
    if (quiet === undefined) throw new Error('no track at full');
    expect(trackVolume(loud, 1)).toBeLessThan(trackVolume(quiet, 1));
    for (const t of TRACKS)
      for (const f of [0, 0.5, 1]) {
        expect(trackVolume(t, f)).toBeGreaterThanOrEqual(0);
        expect(trackVolume(t, f)).toBeLessThanOrEqual(1);
      }
  });
});
