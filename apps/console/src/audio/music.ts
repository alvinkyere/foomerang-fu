import type { MusicScene } from './playlist';

/**
 * The music (musicPlayer.ts), loaded after the first screen is up (its own chunk: the first load stays inside its budget).
 * The scene asked for before it arrives is the one it starts on.
 */
let player: { want(scene: MusicScene): void } | undefined;
let loading: Promise<void> | undefined;
let wanted: MusicScene | undefined;

export function loadMusic(): Promise<void> {
  loading ??= import('./musicPlayer')
    .then((m) => {
      m.musicPlayer.start();
      player = m.musicPlayer;
      if (wanted !== undefined) player.want(wanted);
    })
    .catch(() => undefined); // (no music is better than no game)
  return loading;
}

export const music = {
  /** The screen the music should follow: the menus' tracks or the matches'. */
  want(scene: MusicScene): void {
    wanted = scene;
    if (player === undefined) void loadMusic();
    else player.want(scene);
  },
};
