import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BOOMERANG_SHAPE } from '../boomerangShape';
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
  /** Its boomerang while it holds it: in its right hand (screen-left facing us), pointing out from the body (ss01). */
  readonly #held = new THREE.Group();
  #heldBody: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial> | undefined;
  /** Charging a throw: a soft glow in its colour round the boomerang it holds (the banana charging, ss11). */
  #glow: THREE.Sprite | undefined;

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
    scene.add(this.#held);
  }

  /**
   * Gives it its boomerang to hold (render/three/boomerangModel.ts, `unit` scene units per world unit): by the end of one arm,
   * standing on edge, that arm pointing out from the body and the elbow at its far end, the other arm rising from there (the
   * banana and the donut at ss01, seen edge-on).
   */
  hold(
    body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>,
    span: number,
    unit: number,
  ): void {
    const bend = (BOOMERANG_SHAPE.bendDegrees * Math.PI) / 360;
    body.geometry.computeBoundingBox();
    const box = body.geometry.boundingBox;
    // its left tip's centre (lying flat: tips at the back, -z; elbow at +z), where the hand grips it
    const tip = new THREE.Vector3(-span * unit * 0.4, 0, box?.min.z ?? 0);
    const m = new THREE.Matrix4()
      .makeRotationX(-Math.PI / 2) // its flat side stands up: lying x/z becomes x/y
      .multiply(new THREE.Matrix4().makeRotationY(-Math.atan2(Math.cos(bend), Math.sin(bend)))) // the grip arm along +x
      .multiply(new THREE.Matrix4().makeTranslation(-tip.x, -tip.y, -tip.z));
    body.matrixAutoUpdate = false;
    body.matrix.copy(m);
    this.#heldBody = body;
    this.#held.add(body);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: body.material.color.clone().lerp(new THREE.Color(1, 1, 1), 0.45),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.scale.setScalar(span * unit * 1.6);
    glow.position.set(span * unit * 0.35, span * unit * 0.25, 0);
    glow.visible = false;
    this.#glow = glow;
    this.#held.add(glow);
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
    armed = false,
    /** Charging a throw, 0–1: the glow round the boomerang it holds. */
    charge = 0,
    /** Its body's tilt on screen (walking: render/walkMotion.ts): the hands turn with it about its feet. */
    tilt?: { readonly axis: THREE.Vector3; readonly angle: number },
    /** Swinging (render/slashMotion.ts): where its boomerang hand is, from its feet (scene), instead of where the bake had it. */
    swingGrip?: SceneOffset,
  ): void {
    const at = handOffsets(this.hands, heading, airborne, this.characterScale);
    const turn =
      tilt === undefined
        ? undefined
        : new THREE.Quaternion().setFromAxisAngle(tilt.axis, tilt.angle);
    this.meshes.forEach((m, k) => {
      const o = k === 0 && swingGrip !== undefined ? swingGrip : (at[k] as SceneOffset);
      const e = k === 0 && swingGrip !== undefined ? ZERO : (extra[k] as SceneOffset);
      const v = new THREE.Vector3(o.x + e.x, lift + o.y + e.y, o.z + e.z);
      if (turn !== undefined) v.applyQuaternion(turn);
      m.position.set(feet.x + v.x, feet.y + v.y, feet.z + v.z);
      m.rotation.set(0, yaw, 0);
      m.visible = opacity > 0;
    });
    this.#material.opacity = opacity;
    this.#material.depthWrite = opacity >= 1;
    // its boomerang, in its right hand (hand 0), pointing out from the body
    const grip = this.meshes[0].position;
    const out = swingGrip ?? (at[0] as SceneOffset);
    this.#held.visible = armed && opacity > 0 && this.#heldBody !== undefined;
    this.#held.position.copy(grip);
    this.#held.rotation.set(0, Math.atan2(-out.z, out.x), 0);
    if (this.#heldBody !== undefined) {
      this.#heldBody.material.opacity = opacity;
      this.#heldBody.material.depthWrite = opacity >= 1;
    }
    if (this.#glow !== undefined) {
      this.#glow.visible = charge > 0;
      (this.#glow.material as THREE.SpriteMaterial).opacity = 0.85 * charge * opacity;
    }
  }

  /** A hand's size (scene units) and where hand `k` is now (scene). */
  get size(): number {
    return this.hands.size * this.characterScale;
  }
  positionOf(k: 0 | 1): THREE.Vector3 {
    return this.meshes[k].position;
  }

  destroy(scene: THREE.Scene): void {
    for (const m of this.meshes) scene.remove(m);
    scene.remove(this.#held);
    this.#heldBody?.material.dispose();
    this.meshes[0].geometry.dispose();
    this.#material.dispose();
  }
}

const ZERO: SceneOffset = { x: 0, y: 0, z: 0 };
const NO_EXTRA: readonly [SceneOffset, SceneOffset] = [ZERO, ZERO];

let glow: THREE.DataTexture | undefined;
/** A soft round glow, white in the middle fading to nothing at its edge. */
function glowTexture(): THREE.DataTexture {
  if (glow !== undefined) return glow;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y += 1)
    for (let x = 0; x < n; x += 1) {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const a = Math.max(0, 1 - r) ** 2;
      data.set([255, 255, 255, Math.round(255 * a)], (y * n + x) * 4);
    }
  glow = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  glow.needsUpdate = true;
  return glow;
}
