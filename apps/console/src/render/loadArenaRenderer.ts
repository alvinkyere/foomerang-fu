import type { ArenaChoice } from '../runtime/powerupMode';
import type { ArenaRendererLoader } from './renderer';
import { reconstructedMapFor } from './reconstructed/maps';
import { rendererKindFor } from './rendererKind';
import { phaserRendererFor } from './phaser/loadPhaserRenderer';

/**
 * The renderer for a match's map: the market plaza in real-time 3D (three.js, its own chunk), everything else on Phaser. Both
 * are fetched only when a match needs them.
 */
export const arenaRendererFor =
  (arena: ArenaChoice): ArenaRendererLoader =>
  async (container) => {
    const map = reconstructedMapFor(arena);
    if (rendererKindFor(arena) === 'three' && map !== undefined) {
      const { createThreePlaza } = await import('./three/ThreePlaza');
      return createThreePlaza(container, map);
    }
    return phaserRendererFor(arena)(container);
  };
