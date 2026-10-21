import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { handOffsets, type CharacterHands, type SceneOffset } from '../characterRig';

/** How round a hand's corners are, as a fraction of its size (the pack's hand: a rounded cube). */
const ROUNDING = 0.32;

/**
 * A character's two hands, drawn by the game (render/characterRig.ts): small rounded cubes in the video's hand colour, lit and
 * shaded as the plaza is, standing where the bake had them for the frame its body shows. `place` takes extra per-hand offsets
 * (scene units) so a pose can move them: swinging as it walks, holding up its boomerang, swinging it.
 */
export class Hands {
  readonly meshes: readonly [THREE.Mesh, THREE.Mesh];
  readonly #material: THREE.MeshToonMaterial;

  constructor(
    scene: THREE.Scene,
    readonly hands: CharacterHands,
    readonly characterScale: number,
    gradient: THREE.Texture,
  ) {
    const size = hands.size * characterScale;
    const geometry = new RoundedBoxGeometry(size, size, size, 3, size * ROUNDING);
    this.#material = new THREE.MeshToonMaterial({
      color: new THREE.Color(hands.colour),
      gradientMap: gradient,
      transparent: true,
    });
    const make = () => {
      const m = new THREE.Mesh(geometry, this.#material);
      m.castShadow = true;
      scene.add(m);
      return m;
    };
    this.meshes = [make(), make()];
  }

  /**
   * Puts the hands where the bake had them for this atlas frame, from the ground point `feet` (scene), raised by `lift` (scene
   * units, the body's hop), each moved by its own `extra`, and turned with the body (`yaw`, radians about the vertical).
   */
  place(
    feet: THREE.Vector3,
    heading: number,
    airborne: boolean,
    lift: number,
    opacity: number,
    yaw: number,
    extra: readonly [SceneOffset, SceneOffset] = NO_EXTRA,
  ): void {
    const at = handOffsets(this.hands, heading, airborne, this.characterScale);
    this.meshes.forEach((m, k) => {
      const o = at[k] as SceneOffset;
      const e = extra[k] as SceneOffset;
      m.position.set(feet.x + o.x + e.x, feet.y + lift + o.y + e.y, feet.z + o.z + e.z);
      m.rotation.set(0, yaw, 0);
      m.visible = opacity > 0;
    });
    this.#material.opacity = opacity;
    this.#material.depthWrite = opacity >= 1;
  }

  destroy(scene: THREE.Scene): void {
    for (const m of this.meshes) scene.remove(m);
    this.meshes[0].geometry.dispose();
    this.#material.dispose();
  }
}

const ZERO: SceneOffset = { x: 0, y: 0, z: 0 };
const NO_EXTRA: readonly [SceneOffset, SceneOffset] = [ZERO, ZERO];
