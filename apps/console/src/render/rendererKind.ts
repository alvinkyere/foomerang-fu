import type { ArenaChoice } from '../runtime/powerupMode';

/**
 * Which renderer draws a map. The market plaza is drawn in real-time 3D (three.js, src/render/three): its own lit models,
 * real light and shadows. Every other map, and the test arenas, stay on Phaser (src/render/phaser).
 */
export type RendererKind = 'three' | 'phaser';

export const rendererKindFor = (arena: ArenaChoice): RendererKind =>
  arena === 'market_plaza' ? 'three' : 'phaser';
