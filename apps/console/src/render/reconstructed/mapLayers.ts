/**
 * The object layers of a reconstructed map, from its manifest. Each layer is a cut-out of the baked art drawn over the ground,
 * sorted against the players by DEPTH: the canvas y of its ground contact. A player whose feet are above (north of) it is drawn
 * behind it. A layer may carry SLICES — its ground-contact line column by column (x0..x1 canvas px, each with its own depth) —
 * so a round or angled object (a fountain, a 45-degree stall) hides a player standing behind each part of it, and never one
 * standing beside it. Pure: no Phaser, so it can be tested.
 */
export interface LayerSlice {
  readonly x0: number;
  readonly x1: number;
  readonly depth: number;
}

export interface MapLayer {
  readonly key: string;
  readonly file: string;
  /** Top-left of the cut-out on the baked canvas. */
  readonly x: number;
  readonly y: number;
  /** The layer's front-most ground contact (its depth when it has no slices). */
  readonly depth: number;
  /** A tall object that fades while it hides a living player. */
  readonly fade: boolean;
  readonly slices?: readonly LayerSlice[];
}

export interface MapLayers {
  readonly occluders: readonly MapLayer[];
  /** Canvas px per character-atlas px (the map's characters drawn at its own reference size). */
  readonly characterScale: number;
}

/** One drawn piece of a layer: the columns cropped from its image, and their depth. */
export interface LayerPart {
  readonly cropX: number;
  readonly width: number;
  readonly depth: number;
}

const MAX_LAYERS = 512;
const MAX_SLICES = 1024;
const FILE = /^[A-Za-z0-9_-]{1,64}\.(webp|png)$/;
const KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** The manifest is fetched over the network, so its layers are checked before the renderer trusts them. */
export function parseMapLayers(value: unknown): MapLayers {
  const fail = (what: string): never => {
    throw new Error(`map layers: invalid ${what}`);
  };
  const num = (v: unknown, what: string): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fail(what);
  const obj = (v: unknown, what: string): Record<string, unknown> =>
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : fail(what);
  const m = obj(value, 'manifest');
  const list = m['occluders'];
  if (!Array.isArray(list) || list.length > MAX_LAYERS) fail('occluders');
  const occluders = (list as unknown[]).map((item): MapLayer => {
    const o = obj(item, 'occluder');
    const key = o['key'];
    const file = o['file'];
    if (typeof key !== 'string' || !KEY.test(key)) fail('key');
    if (typeof file !== 'string' || !FILE.test(file)) fail('file');
    const x = num(o['x'], 'position');
    const y = num(o['y'], 'position');
    const depth = num(o['depth'], 'depth');
    const fade = o['fade'] === true;
    const raw = o['slices'];
    if (raw === undefined) return { key: key as string, file: file as string, x, y, depth, fade };
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SLICES) fail('slices');
    let end = x;
    const slices = (raw as unknown[]).map((s): LayerSlice => {
      const v = obj(s, 'slice');
      const x0 = num(v['x0'], 'slice');
      const x1 = num(v['x1'], 'slice');
      if (x0 < end || x1 <= x0) fail('slice'); // in order, inside the layer, never overlapping
      end = x1;
      return { x0, x1, depth: num(v['depth'], 'slice') };
    });
    return { key: key as string, file: file as string, x, y, depth, fade, slices };
  });
  const scale = m['characterScale'];
  if (scale !== undefined && (typeof scale !== 'number' || !(scale > 0 && scale <= 4)))
    throw new Error('map layers: invalid characterScale');
  return { occluders, characterScale: (scale as number | undefined) ?? 1 };
}

/** The pieces a layer is drawn as: one per slice (clamped to its image), or the whole image at the layer's depth. */
export function layerParts(layer: MapLayer, imageWidth: number): readonly LayerPart[] {
  if (layer.slices === undefined) return [{ cropX: 0, width: imageWidth, depth: layer.depth }];
  return layer.slices
    .map((s) => {
      const cropX = Math.max(0, s.x0 - layer.x);
      return { cropX, width: Math.min(imageWidth, s.x1 - layer.x) - cropX, depth: s.depth };
    })
    .filter((p) => p.width > 0);
}
