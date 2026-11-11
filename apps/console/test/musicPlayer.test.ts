import { describe, expect, it } from 'vitest';
import { MusicPlayer, SETTLE, type AudioLike } from '../src/audio/musicPlayer';
import { FADE, Playlist, TRACKS } from '../src/audio/playlist';

// The music player: crossfades between the owner's tracks when the screen changes and when a track ends; a round's arena
// being torn down and set up again does not interrupt it.

class FakeAudio implements AudioLike {
  src = '';
  volume = 1;
  preload = '';
  currentTime = 0;
  paused = true;
  blocked = false;
  play(): Promise<void> {
    if (this.blocked) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  removeAttribute(): void {
    this.src = '';
  }
  load(): void {
    this.currentTime = 0;
  }
}

const rig = (blocked = false) => {
  let t = 0;
  const made: FakeAudio[] = [];
  const player = new MusicPlayer({
    make: () => {
      const a = new FakeAudio();
      a.blocked = blocked;
      made.push(a);
      return a;
    },
    now: () => t,
    playlist: new Playlist(() => 0.5),
    base: '/',
  });
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 10); i += 1) {
      t += 0.1;
      for (const a of made) if (!a.paused) a.currentTime += 0.1;
      player.tick();
    }
  };
  return { player, made, run, at: () => t };
};

describe('the music player', () => {
  it('the menus start on the theme at once, at its level', () => {
    const { player, made } = rig();
    player.want('menu');
    expect(player.playing?.id).toBe('theme');
    expect(made[0]?.src).toBe('/audio/music/theme.mp3');
    expect(made[0]?.paused).toBe(false);
  });

  it('a match crossfades in a match track: both sound during the fade, then only the new one, at full', () => {
    const { player, made, run } = rig();
    player.want('menu');
    run(5);
    player.want('match');
    run(SETTLE + 0.2);
    expect(player.sounding).toBe(2);
    expect(player.playing?.scene).toBe('match');
    const [menu, match] = made as [FakeAudio, FakeAudio];
    run(FADE.scene / 2);
    expect(menu.volume).toBeGreaterThan(0);
    expect(match.volume).toBeGreaterThan(0);
    run(FADE.scene);
    expect(player.sounding).toBe(1);
    expect(menu.paused).toBe(true);
    expect(menu.src).toBe(''); // (let go of)
    const track = TRACKS.find((t) => t.id === player.playing?.id);
    expect(match.volume).toBeCloseTo(0.7 * (track?.gain ?? 0), 5);
  });

  it('a round’s arena torn down and set up again at once does not touch the music', () => {
    const { player, made, run } = rig();
    player.want('match');
    run(3);
    player.want('menu');
    run(0.1);
    player.want('match');
    run(3);
    expect(made).toHaveLength(1);
    expect(player.sounding).toBe(1);
  });

  it('a track hands over to the next of its scene a few seconds before its end, and the music never stops', () => {
    const { player, made, run } = rig();
    player.want('match');
    const first = player.playing;
    if (first === undefined) throw new Error('nothing playing');
    run(first.end - FADE.track - 0.5);
    expect(made).toHaveLength(1);
    run(1);
    expect(made).toHaveLength(2);
    expect(player.playing?.id).not.toBe(first.id);
    expect(player.playing?.scene).toBe('match');
    run(FADE.track + 0.5);
    expect(player.sounding).toBe(1);
    expect(made[1]?.paused).toBe(false);
  });

  it('held back by the browser, it starts on the first key or tap', () => {
    const { player, made } = rig(true);
    player.start();
    player.want('menu');
    const el = made[0] as FakeAudio;
    expect(el.paused).toBe(true);
    el.blocked = false;
    globalThis.dispatchEvent?.(new Event('keydown'));
    expect(el.paused).toBe(false);
  });

  it('an older browser’s play() that returns nothing, or throws, does not stop the game', () => {
    for (const play of [
      () => undefined,
      () => {
        throw new Error('no audio');
      },
    ]) {
      const player = new MusicPlayer({
        make: () => Object.assign(new FakeAudio(), { play }),
        now: () => 0,
      });
      expect(() => player.want('menu')).not.toThrow();
      expect(player.playing?.id).toBe('theme');
    }
  });

  it('off: silent', () => {
    const made: FakeAudio[] = [];
    const player = new MusicPlayer({
      make: () => {
        const a = new FakeAudio();
        made.push(a);
        return a;
      },
      now: () => 0,
      enabled: false,
    });
    player.want('menu');
    player.tick();
    expect(made).toHaveLength(0);
  });
});
