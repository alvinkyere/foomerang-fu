import * as THREE from 'three';
import { PEN_CHIPS, penChipAt, penStreaksAt } from '../penOpening';

/** The streaks round the knob in the strike's first frame (the aubergine's pen at 3.717 s: six, ~0.45 to 1.1 units out). */
const STREAKS = 6;
/** The ground's north as the fixed camera draws it, against its east (a unit north is ~26 px, a unit east ~29). */
const NORTH_ON_SCREEN = 0.88;

/** Where a lever's knob is (scene), scene units a plan unit, and the ground's east, north and up (scene directions). */
export interface PenBurstPlace {
  readonly knob: THREE.Vector3;
  readonly unit: number;
  readonly east: THREE.Vector3;
  readonly north: THREE.Vector3;
  readonly up: THREE.Vector3;
}

/**
 * One warm-up lever's burst when struck (render/penOpening.ts): chips of the struck colour flying out from its knob and falling to
 * the ground, and a frame of radial streaks round it. Flat sprites (the camera never turns), in scene units through `unit` (scene
 * units a plan unit) and the ground's east and north.
 */
export class PenBurst {
  readonly #chips: THREE.Sprite[] = [];
  readonly #streaks: THREE.Sprite[] = [];
  readonly #material = new THREE.SpriteMaterial({ color: '#ffffff' });
  readonly #place: PenBurstPlace;

  constructor(scene: THREE.Scene, place: PenBurstPlace) {
    this.#place = place;
    const unit = place.unit;
    const sprite = (rotation: number): THREE.Sprite => {
      const material = this.#material.clone();
      material.rotation = rotation;
      const s = new THREE.Sprite(material);
      s.visible = false;
      s.renderOrder = 5;
      scene.add(s);
      return s;
    };
    for (let k = 0; k < PEN_CHIPS; k += 1) {
      const c = penChipAt(0.1, k);
      this.#chips.push(sprite(Math.atan2(c.y * NORTH_ON_SCREEN, c.x)));
    }
    for (let k = 0; k < STREAKS; k += 1) {
      const turn = ((k + 0.3) / STREAKS) * 2 * Math.PI;
      const s = sprite(Math.atan2(Math.sin(turn) * NORTH_ON_SCREEN, Math.cos(turn)));
      this.#at(s, Math.cos(turn) * 0.78, Math.sin(turn) * 0.78, 1.4);
      s.scale.set(0.65 * unit, 0.07 * unit, 1);
      this.#streaks.push(s);
    }
  }

  #at(s: THREE.Sprite, x: number, y: number, z: number): void {
    const p = this.#place;
    s.position
      .copy(p.knob)
      .addScaledVector(p.east, x * p.unit)
      .addScaledVector(p.north, y * p.unit)
      .addScaledVector(p.up, (z - 1.4) * p.unit);
  }

  /** `t`: seconds since the strike (undefined: not struck); `colour`: what the chips show. */
  frame(t: number | undefined, colour: THREE.Color): void {
    this.#chips.forEach((s, k) => {
      const c = t === undefined ? undefined : penChipAt(t, k);
      s.visible = c?.visible === true;
      if (c === undefined || !s.visible) return;
      (s.material as THREE.SpriteMaterial).color.copy(colour);
      this.#at(s, c.x, c.y, c.z);
      s.scale.set(c.length * this.#place.unit, c.width * this.#place.unit, 1);
    });
    const streaks = penStreaksAt(t);
    for (const s of this.#streaks) {
      s.visible = streaks;
      (s.material as THREE.SpriteMaterial).color.copy(colour);
    }
  }
}
