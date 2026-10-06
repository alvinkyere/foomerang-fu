import type { ArenaRendererLoader } from '../renderer';

/** Phaser is a large dependency, so it is a separate chunk that is fetched only when an arena is needed. */
export const loadPhaserRenderer: ArenaRendererLoader = async (container) => {
  const { createPhaserArena } = await import('./PhaserArena');
  return createPhaserArena(container);
};
