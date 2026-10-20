import type { ArenaChoice } from '../runtime/powerupMode';
import type { ArenaView, SystemsViewModel, WallView } from './viewModel';

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
  /** What the arena systems look like right now on screen (gate/hazard status, platform places). */
  drawnSystems?(): SystemsViewModel | undefined;
  /** The breakable props drawn broken and how many pieces lie about (the 3D plaza; undefined elsewhere). */
  drawnProps?(): { readonly broken: readonly string[]; readonly pieces: number };
  /** Where a player is on screen, as fractions of the viewport (0..1): the end of the match closes in on the winner. */
  screenOf?(id: string): { readonly x: number; readonly y: number } | undefined;
  /** Which character each player is drawn as (the 3D plaza only). */
  drawnCharacters?(): Readonly<Record<string, string>>;
  /** The walls currently on screen (games without geometry return none). */
  drawnWalls(): readonly WallView[];
  /** DEVELOPMENT ONLY (the showcase and its capture script): take the renderer's clock away from the browser and hand back a function that advances it to a virtual time, so frames are deterministic. */
  driveClock?(): (virtualMs: number) => void;
  destroy(): void;
}

/**
 * Loads a renderer for one match's map (`arena`: absent for games without maps, which use the
 * primitive renderer). A new map means a new renderer.
 */
export type ArenaRendererLoader = (
  container: HTMLElement,
  arena?: ArenaChoice,
) => Promise<ArenaRenderer>;
