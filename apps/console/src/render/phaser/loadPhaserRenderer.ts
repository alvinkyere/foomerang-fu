import type { ArenaRendererLoader } from '../renderer';
import type { ArenaChoice } from '../../runtime/powerupMode';

/**
 * Phaser is a large dependency, so it is a separate chunk that is fetched only when an arena is needed; Garden's renderer is
 * a further chunk that only Garden players download.
 */
export const phaserRendererFor =
  (arena: ArenaChoice): ArenaRendererLoader =>
  async (container) => {
    if (arena === 'market_plaza') {
      const { createPlazaArena } = await import('./plaza/PlazaArena');
      return createPlazaArena(container);
    }
    if (arena === 'garden') {
      const { createGardenArena } = await import('./garden/GardenArena');
      return createGardenArena(container);
    }
    const { createPhaserArena } = await import('./PhaserArena');
    return createPhaserArena(container);
  };

/** The primitive test arenas' renderer (kept for tests and `?arena=primitive`/`systems`). */
export const loadPhaserRenderer: ArenaRendererLoader = phaserRendererFor('primitive');
