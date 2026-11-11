import type { ArenaView } from '../render/viewModel';
import { musicPlayer } from './musicPlayer';
import type { SoundEngine } from './soundEngine';

/**
 * The game's sound, loaded after the first screen is up (its own chunk: the first load stays small). Until it has arrived
 * every call is a no-op, and an arena that asked for music before then gets it the moment the engine is ready.
 */
let engine: SoundEngine | undefined;
let loading: Promise<void> | undefined;
let wanted = false;

export function loadSound(): Promise<void> {
  loading ??= import('./soundEngine')
    .then((m) => {
      engine = m.soundEngine;
      if (wanted) engine.start();
    })
    .catch(() => undefined); // (no sound is better than no game)
  return loading;
}

export const sound = {
  /** An arena is up: the matches' music (musicPlayer.ts) and the effects. */
  start(): void {
    musicPlayer.want('match');
    wanted = true;
    if (engine === undefined) void loadSound();
    else engine.start();
  },
  /** The arena is gone: back to the menus' music. */
  stop(): void {
    musicPlayer.want('menu');
    wanted = false;
    engine?.stop();
  },
  /** One frame's view: a sound for each event in it. */
  frame(view: ArenaView): void {
    engine?.frame(view);
  },
};
