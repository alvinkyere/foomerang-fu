import type { ArenaRendererLoader } from '../renderer';
import type { ArenaChoice } from '../../runtime/powerupMode';
import { reconstructedMapFor } from '../reconstructed/maps';

/**
 * Phaser is a large dependency, so it is a separate chunk that is fetched only when an arena is needed; Garden's renderer is
 * a further chunk that only Garden players download.
 */
export const phaserRendererFor =
  (arena: ArenaChoice): ArenaRendererLoader =>
  async (container) => {
    const reconstructed = reconstructedMapFor(arena);
    if (reconstructed !== undefined) {
      const { createReconstructedArena } = await import('./reconstructed/ReconstructedArena');
      return createReconstructedArena(container, reconstructed);
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
