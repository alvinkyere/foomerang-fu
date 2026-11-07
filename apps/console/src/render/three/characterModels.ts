import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { cutGeometry } from './meshCut';

/**
 * The pack characters as 3D models (art/reconstruction/runtime/export_chars3d.py: one unit tall, feet at the origin, heading 0
 * as the atlases' frame 0), for what a sprite cannot do: a killed character comes apart in 3D as the HQs show it (the eggplant
 * at HQ1 2:03.4 and 3:19.3: cut across, the top flying off, the bottom standing with its flat pale cut face).
 *
 * Parts: `body`, `hand_L`, `hand_R`, `face_eyes`, `face_mouth`, `face_dead_eyes`. A character is cut once per height (the cut is
 * always level: every cut in the HQs runs across the body) and the pieces are shared by every death of that character.
 */
export type Part = 'body' | 'hand_L' | 'hand_R' | 'face_eyes' | 'face_mouth' | 'face_dead_eyes';

export interface Model {
  /** Each part's geometry (model units) and its own materials, one per group (the body's texture, the face's flat black, …). */
  readonly parts: ReadonlyMap<
    Part,
    { geometry: THREE.BufferGeometry; materials: readonly THREE.Material[] }
  >;
}

/** One piece of a cut character: its parts' cut geometries, the cap (the inside) a group of each body geometry. */
export interface Piece {
  readonly parts: ReadonlyMap<Part, THREE.BufferGeometry>;
}

export class CharacterModels {
  readonly #loading = new Map<string, Promise<Model | undefined>>();
  readonly #models = new Map<string, Model>();
  readonly #cuts = new Map<string, readonly [Piece, Piece]>();

  constructor(readonly base: string) {}

  /** Starts loading these characters (a missing model is left out: the death then falls back to the sprite's). */
  preload(kinds: Iterable<string>): void {
    for (const kind of kinds) void this.load(kind);
  }

  load(kind: string): Promise<Model | undefined> {
    const known = this.#loading.get(kind);
    if (known !== undefined) return known;
    const loading = new GLTFLoader()
      .loadAsync(`${this.base}${kind}.glb`)
      .then((gltf) => {
        const parts = new Map<
          Part,
          { geometry: THREE.BufferGeometry; materials: THREE.Material[] }
        >();
        gltf.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const name = o.name.replace(/_\d+$/, '') as Part;
          o.updateWorldMatrix(true, false);
          const geometry = (o.geometry as THREE.BufferGeometry)
            .clone()
            .applyMatrix4(o.matrixWorld)
            .toNonIndexed();
          geometry.clearGroups();
          const known = parts.get(name);
          // (a part with two materials comes in as one mesh per material: they are merged back, one group each)
          parts.set(name, {
            geometry:
              known === undefined ? whole(geometry) : mergeAsGroups(known.geometry, geometry),
            materials: [...(known?.materials ?? []), o.material as THREE.Material],
          });
        });
        const model: Model = { parts };
        this.#models.set(kind, model);
        return model;
      })
      .catch(() => undefined);
    this.#loading.set(kind, loading);
    return loading;
  }

  /** The model, once it is in. */
  get(kind: string): Model | undefined {
    return this.#models.get(kind);
  }

  /** The character cut level at `height` (a fraction of its height, from its feet): [above, below]. */
  cut(kind: string, height: number): readonly [Piece, Piece] | undefined {
    const model = this.#models.get(kind);
    if (model === undefined) return undefined;
    const key = `${kind}@${height}`;
    const known = this.#cuts.get(key);
    if (known !== undefined) return known;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    const above = new Map<Part, THREE.BufferGeometry>();
    const below = new Map<Part, THREE.BufferGeometry>();
    for (const [part, { geometry }] of model.parts) {
      const halves = cutGeometry(geometry, plane);
      above.set(part, halves.above);
      below.set(part, halves.below);
    }
    const pieces = [{ parts: above }, { parts: below }] as const;
    this.#cuts.set(key, pieces);
    return pieces;
  }
}

function whole(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.addGroup(0, g.getAttribute('position').count, 0);
  return g;
}

function mergeAsGroups(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const x = a.index === null ? a : a.toNonIndexed();
  const y = b.index === null ? b : b.toNonIndexed();
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const p = x.getAttribute(name);
    const q = y.getAttribute(name);
    if (p === undefined || q === undefined) continue;
    const merged = new Float32Array(p.array.length + q.array.length);
    merged.set(p.array as Float32Array, 0);
    merged.set(q.array as Float32Array, p.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(merged, p.itemSize));
  }
  const n = x.getAttribute('position').count;
  for (const g of x.groups) out.addGroup(g.start, g.count, g.materialIndex);
  out.addGroup(n, y.getAttribute('position').count, x.groups.length);
  return out;
}
