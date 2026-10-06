import type { ArenaView, WallView } from './viewModel';

/** Where a drawn circle actually is, in world units — read back from the renderer, not assumed. */
export interface DrawnCircle {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/**
 * What the UI needs from whatever draws the arena. The only implementation today is Phaser
 * (src/render/phaser), loaded lazily; React and the runtime know only this interface.
 * A renderer DRAWS a view. It never steps the simulation and never invents a position.
 */
export interface ArenaRenderer {
  render(view: ArenaView): void;
  /** What is currently on screen, for evidence that drawing follows the authoritative state. */
  drawn(): readonly DrawnCircle[];
  /** The boomerangs currently on screen (games without them return none). */
  drawnBoomerangs(): readonly DrawnCircle[];
  /** The powerup pickups currently on screen (games without them return none). */
  drawnPickups?(): readonly DrawnCircle[];
  /** The walls currently on screen (games without geometry return none). */
  drawnWalls(): readonly WallView[];
  destroy(): void;
}

export type ArenaRendererLoader = (container: HTMLElement) => Promise<ArenaRenderer>;
