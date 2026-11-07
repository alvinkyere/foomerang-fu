import * as THREE from 'three';
import {
  PUDDLE,
  bitAt,
  bitsFor,
  dropAt,
  dropsFor,
  halfAt,
  halvesFor,
  puddleRadius,
  shardAt,
  shardsFor,
  type Half,
  type Liquid,
} from '../deathMotion';
import { FIRE_MOTION, burntTilt, lastFlames, smokeBall } from '../fireMotion';
import { CUT, DEAD_EYES_AT, gooAt, gooColourOf, gooFor, topAt, topFor } from '../cutMotion';
import type { CharacterModels, Part as ModelPart, Piece } from './characterModels';

/** What a dying character looks like at the moment it dies (from its sprite). */
export interface Victim {
  readonly id: string;
  /** Its feet, on the ground (scene). */
  readonly at: THREE.Vector3;
  /** Its atlas (the character's own sprite sheet), the cell size and its feet in the cell, and the frame it showed. */
  readonly atlas: THREE.Texture;
  readonly cell: number;
  readonly anchor: readonly [number, number];
  readonly frame: number;
  /** The sprite's height (the whole cell) and the character's own height, scene units. */
  readonly spriteHeight: number;
  readonly bodyHeight: number;
  /** Its own colour (droplets, shards). */
  readonly colour: string;
  /** The mug shatters; everyone else is cut in two (`deathOf`). */
  readonly shatters: boolean;
  /** What it spills, if it is liquid (the mug its coffee, the milk its milk). */
  readonly spills: Liquid | undefined;
  /** It died burning (FIRE_BOOMERANG): it falls whole onto its side and smokes instead (render/fireMotion.ts). */
  readonly burnt?: boolean;
  /** The video's own last flames and smoke play over it (flipbooks.ts): no drawn ones then. */
  readonly videoSmoke?: boolean;
  /** Which character it is (its 3D model, render/three/characterModels.ts) and its hands' colour as drawn. */
  readonly kind?: string;
  readonly handColour?: string;
  /** It was frozen in its ice block (ICE_BOOMERANG) when it died: the block bursts with it (HQ2 14:17.0). */
  readonly frozen?: boolean;
  /** An explosion killed it: its pieces are flung several times as far (HQ1 4:14.3). */
  readonly blown?: boolean;
}

/**
 * The inside of each character, shown on its cut face (the HQ's eggplant: a pale cream; the pack's own inside colours where the
 * model shows them: the toast's crumb, the watermelon's flesh, …). Not every one is seen cut in the HQs (README: "Every death").
 */
export const INSIDE: Readonly<Record<string, string>> = {
  bread: '#e6c87a',
  banana: '#f6f0c8',
  donut: '#eec48a',
  carrot: '#f8b06a',
  avocado: '#dceba2',
  watermelon: '#f2615c',
  milk: '#f6f4ee',
  bacon: '#f4c2b0',
  icecream: '#cdf3df',
  coffee: '#f4f1ea',
};
const INSIDE_DEFAULT = '#f3ecd2';
/** A "cut" above the head: the whole character in its lower piece (a burnt one falls whole). */
const WHOLE = 2;

interface Part {
  readonly object: THREE.Object3D;
  readonly pose: (t: number) => void;
}

/** Where the cut crosses the body: this fraction of its height up from its feet (the eggplant, HQ 2:03.0). */
const CUT_HEIGHT = 0.55;

/** The liquids: the coffee in the mug (its darkest large colour) and milk (white). */
const LIQUID: Readonly<Record<Liquid, number>> = { coffee: 0x5b392a, milk: 0xf6f4ee };

/**
 * A killed character's remains on the TV, as the reference video shows them (measured: `render/deathMotion.ts`): a soft
 * character is cut in two, the far half sliding away along the ground and turning while the near half stays about where it
 * died, with a burst of bits in its colour; a liquid one spills (the mug its coffee, the milk its milk: a splash, droplets drifting out, then the puddle spreading)
 * and the mug leaves a few ceramic shards. They lie there until the character is back (a new round). A soft death's lengths are in the
 * character's widths, taken as its body height (the video's characters are about as wide as tall); the mug's are world units.
 */
export class DeathRemains {
  readonly #parts = new Map<string, { born: number; parts: Part[] }>();

  readonly #heights = new WeakMap<object, Map<number, readonly [number, number]>>();

  constructor(
    readonly scene: THREE.Scene,
    /** A length in world units -> scene units. */
    readonly length: (worldUnits: number) => number,
    /** In 3D (owner, 2026-11-06): the camera (to size a model as its sprite was drawn), the models and the toon light bands. */
    readonly solid?: {
      readonly camera: THREE.Camera;
      readonly models: CharacterModels;
      readonly gradient: THREE.Texture;
    },
  ) {}

  burst(v: Victim, hit: { x: number; z: number } | undefined, now: number): void {
    this.clear(v.id);
    const parts: Part[] = [];
    // the 3D cut, as every death in the HQs (cutMotion.ts), once its model is in; the mug still shatters
    const pieces =
      this.solid === undefined || v.kind === undefined || v.shatters
        ? undefined
        : // burnt: not cut, it falls whole onto its side (HQ1 9:57.6-10:01): its model "cut" above its head is the whole of it
          this.solid.models.cut(v.kind, v.burnt === true ? WHOLE : CUT.height);
    if (pieces !== undefined && this.solid !== undefined) {
      if (v.spills !== undefined) {
        const colour = LIQUID[v.spills];
        parts.push(this.#puddle(v, colour));
      }
      parts.push(...this.#cut3d(v, hit, pieces, this.solid));
      this.#parts.set(v.id, { born: now, parts });
      this.frame(now);
      return;
    }
    if (v.burnt === true) {
      parts.push(this.#burnt(v));
      if (v.videoSmoke !== true)
        for (let i = 0; i < FIRE_MOTION.death.smokeBalls; i += 1) parts.push(this.#smoke(v, i));
      this.#parts.set(v.id, { born: now, parts });
      this.frame(now);
      return;
    }
    if (v.spills !== undefined) {
      const colour = LIQUID[v.spills];
      parts.push(this.#puddle(v, colour));
      for (const d of dropsFor(v.id)) parts.push(this.#drop(v, d, colour));
    }
    if (v.shatters) {
      for (const s of shardsFor(v.id)) parts.push(this.#shard(v, s));
      // its coffee bursts out as goo, as the HQ's mug (7:23.7, 10:13.6: brown blobs with the white shards)
      if (this.solid !== undefined) {
        const owned: { dispose(): void }[] = [];
        const goo = this.#goo(v, hit, v.bodyHeight, v.bodyHeight, owned);
        if (goo[0] !== undefined)
          goo[0].object.userData['dispose'] = () => {
            for (const o of owned) o.dispose();
          };
        parts.push(...goo);
      }
    } else {
      const [far, near] = halvesFor(hit, v.id);
      parts.push(this.#half(v, far, 1), this.#half(v, near, -1));
      for (const b of bitsFor(v.id)) parts.push(this.#bit(v, b));
    }
    this.#parts.set(v.id, { born: now, parts });
    this.frame(now);
  }

  frame(now: number): void {
    for (const { born, parts } of this.#parts.values()) {
      const t = Math.max(0, now - born) / 1000;
      for (const p of parts) p.pose(t);
    }
  }

  /** The character is back (a new round): its remains go. */
  clear(id: string): void {
    const found = this.#parts.get(id);
    if (found === undefined) return;
    for (const p of found.parts) {
      this.scene.remove(p.object);
      p.object.traverse((o) => {
        // (a model's cut pieces and their textures are shared by every death of that character: kept)
        if (o.userData['shared'] === true) return;
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          o.geometry.dispose();
          const m = o.material as THREE.Material & { map?: THREE.Texture | null };
          m.map?.dispose();
          m.dispose();
        }
      });
      (p.object.userData['dispose'] as (() => void) | undefined)?.();
    }
    this.#parts.delete(id);
  }

  has(id: string): boolean {
    return this.#parts.has(id);
  }

  /**
   * The 3D cut (cutMotion.ts): the character's model, turned and tilted as its sprite was drawn and sized to the sprite's height on
   * screen, cut level; the top flying off along the hit and sliding to a stop, the bottom standing (falling onto its side if it
   * burnt), goo in its colour bursting out, the eyes turning to X's; a frozen one's ice block bursting with it.
   */
  #cut3d(
    v: Victim,
    hit: { x: number; z: number } | undefined,
    [above, below]: readonly [Piece, Piece],
    solid: NonNullable<DeathRemains['solid']>,
  ): Part[] {
    const tilt = THREE.MathUtils.degToRad(-20); // the atlases' standing tilt (bake_chars.py TILTS.stand)
    const yaw = (v.frame * Math.PI) / 8;
    const model = new THREE.Euler(tilt, yaw, 0, 'XYZ');
    const scale = this.#scaleFor(v, below, above, model, solid.camera);
    const H = scale; // its height in scene units (the model is one unit tall)
    const W = v.bodyHeight; // the motion's lengths: its width, about its height as drawn
    const inside = new THREE.MeshToonMaterial({
      color: new THREE.Color(INSIDE[v.kind ?? ''] ?? INSIDE_DEFAULT),
      gradientMap: solid.gradient,
    });
    const top = topFor(hit, v.id, v.blown === true);
    const out: Part[] = [];
    /** What this death made for itself (the pieces' geometry is the model's, shared): freed with its remains. */
    const owned: { dispose(): void }[] = [inside];

    const piece = (p: Piece, isTop: boolean): Part => {
      const pivot = new THREE.Group(); // at the cut, on the body's axis: the piece turns about it
      const holder = new THREE.Group();
      holder.rotation.copy(model);
      holder.scale.setScalar(scale);
      holder.position.set(0, -CUT.height * H, 0);
      pivot.add(holder);
      const eyes: THREE.Object3D[] = [];
      const dead: THREE.Object3D[] = [];
      const loaded = solid.models.get(v.kind ?? '');
      for (const [name, geometry] of p.parts) {
        if (geometry.getAttribute('position').count === 0) continue;
        const source = loaded?.parts.get(name)?.materials ?? [];
        const materials = source.map((m) => this.#toon(m, name, v, solid.gradient));
        owned.push(...materials);
        const mesh = new THREE.Mesh(geometry, [...materials, inside]);
        mesh.userData['shared'] = true;
        mesh.castShadow = true;
        holder.add(mesh);
        if (name === 'face_eyes') eyes.push(mesh);
        if (name === 'face_dead_eyes') dead.push(mesh);
      }
      this.scene.add(pivot);
      const axis = new THREE.Vector3(-top.direction.z, 0, top.direction.x);
      const up = new THREE.Vector3(0, 1, 0);
      const forward = new THREE.Vector3();
      solid.camera.getWorldDirection(forward);
      const sideways = forward.setY(0).normalize();
      return {
        object: pivot,
        pose: (t) => {
          // (burnt, the eyes are X's as it falls: HQ1 9:58.24)
          const deadEyes = v.burnt === true || t >= DEAD_EYES_AT;
          for (const e of eyes) e.visible = !deadEyes;
          for (const e of dead) e.visible = deadEyes;
          pivot.position.set(v.at.x, v.at.y + CUT.height * H, v.at.z);
          pivot.quaternion.identity();
          if (isTop) {
            const q = topAt(top, t);
            pivot.position.add(new THREE.Vector3(q.x * W, q.y * H, q.z * W));
            pivot.quaternion
              .setFromAxisAngle(up, q.turn)
              .multiply(new THREE.Quaternion().setFromAxisAngle(axis, q.tip));
          } else if (v.burnt === true) {
            // burnt: the bottom falls onto its side (fireMotion.ts burntTilt), turning about its feet
            const a = burntTilt(t);
            // (tipping sideways on the screen, about the camera's forward on the ground: its face stays towards us, as the HQ's)
            const q = new THREE.Quaternion().setFromAxisAngle(sideways, -a);
            const lift = new THREE.Vector3(0, CUT.height * H, 0).applyQuaternion(q);
            pivot.position.set(v.at.x + lift.x, v.at.y + lift.y, v.at.z + lift.z);
            pivot.quaternion.copy(q);
          }
        },
      };
    };
    if (v.burnt === true) out.push(piece(below, false));
    else out.push(piece(above, true), piece(below, false), ...this.#goo(v, hit, W, H, owned));
    (out[0] as Part).object.userData['dispose'] = () => {
      for (const o of owned) o.dispose();
    };

    if (v.burnt === true && v.videoSmoke !== true)
      for (let i = 0; i < FIRE_MOTION.death.smokeBalls; i += 1) out.push(this.#smoke(v, i));
    if (v.frozen === true) out.push(...this.#iceBurst(v, hit, W));
    return out;
  }

  /** The goo (cutMotion.ts): round blobs in the character's goo colour, bursting from the cut, spreading, falling, gone. */
  #goo(
    v: Victim,
    hit: { x: number; z: number } | undefined,
    W: number,
    H: number,
    owned: { dispose(): void }[],
  ): Part[] {
    const [r, g, b] = gooColourOf(v.kind, v.colour);
    const gooMaterial = new THREE.MeshBasicMaterial({
      // (measured sRGB colours: read as such, not as linear light)
      color: new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace),
    });
    const sphere = new THREE.SphereGeometry(1, 12, 8);
    owned.push(gooMaterial, sphere);
    return gooFor(hit, v.id).map((blob) => {
      const mesh = new THREE.Mesh(sphere, gooMaterial);
      mesh.userData['shared'] = true;
      const holder = new THREE.Group();
      holder.add(mesh);
      this.scene.add(holder);
      return {
        object: holder,
        pose: (t: number) => {
          const q = gooAt(blob, t);
          mesh.visible = q.size > 0;
          const s = Math.max(1e-4, q.size * W);
          mesh.scale.setScalar(s);
          holder.position.set(v.at.x + q.x * W, v.at.y + q.y * H + s, v.at.z + q.z * W);
        },
      };
    });
  }

  /** A model's material as the plaza draws its things: toon bands, its own texture or colour; the hands in their drawn colour. */
  #toon(m: THREE.Material, part: ModelPart, v: Victim, gradient: THREE.Texture): THREE.Material {
    const src = m as THREE.MeshStandardMaterial;
    const hand = part === 'hand_L' || part === 'hand_R';
    return new THREE.MeshToonMaterial({
      color: hand && v.handColour !== undefined ? new THREE.Color(v.handColour) : src.color,
      map: hand ? null : (src.map ?? null),
      gradientMap: gradient,
    });
  }

  /**
   * The model's scale: as tall on screen as its sprite was drawn (the sprite's opaque rows in its atlas frame, against the model's
   * extent along the camera's up, turned as the sprite was).
   */
  #scaleFor(
    v: Victim,
    below: Piece,
    above: Piece,
    model: THREE.Euler,
    camera: THREE.Camera,
  ): number {
    const rows = this.#rows(v);
    const drawn =
      rows === undefined ? v.bodyHeight : ((rows[1] - rows[0]) / v.cell) * v.spriteHeight;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const m = new THREE.Matrix4().makeRotationFromEuler(model);
    let lo = Infinity;
    let hi = -Infinity;
    const p = new THREE.Vector3();
    for (const piece of [below, above])
      for (const g of piece.parts.values()) {
        const a = g.getAttribute('position');
        for (let i = 0; i < a.count; i += 7) {
          const d = p.fromBufferAttribute(a, i).applyMatrix4(m).dot(up);
          lo = Math.min(lo, d);
          hi = Math.max(hi, d);
        }
      }
    return hi > lo ? drawn / (hi - lo) : v.bodyHeight;
  }

  /** The sprite's opaque rows (top, bottom) in its standing frame, from the atlas's pixels (cached per atlas image). */
  #rows(v: Victim): readonly [number, number] | undefined {
    const image = v.atlas.image as
      (CanvasImageSource & { width: number; height: number }) | undefined;
    if (image === undefined || typeof document === 'undefined') return undefined;
    let known = this.#heights.get(image);
    if (known === undefined) {
      known = new Map();
      this.#heights.set(image, known);
    }
    const cached = known.get(v.frame);
    if (cached !== undefined) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = v.cell;
    canvas.height = v.cell;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (g === null) return undefined;
    g.drawImage(image, v.frame * v.cell, 0, v.cell, v.cell, 0, 0, v.cell, v.cell);
    const data = g.getImageData(0, 0, v.cell, v.cell).data;
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < v.cell; y += 1)
      for (let x = 0; x < v.cell; x += 1)
        if ((data[(y * v.cell + x) * 4 + 3] ?? 0) > 128) {
          if (top < 0) top = y;
          bottom = y;
          break;
        }
    const rows = top < 0 ? undefined : ([top, bottom + 1] as const);
    if (rows !== undefined) known.set(v.frame, rows);
    return rows;
  }

  /** A frozen one's ice block bursting (HQ2 14:17.0): pale cyan chunks flung out from where it stood, falling and fading. */
  #iceBurst(v: Victim, hit: { x: number; z: number } | undefined, W: number): Part[] {
    const material = new THREE.MeshToonMaterial({ color: '#bfeefc', transparent: true });
    const out: Part[] = [];
    for (const blob of gooFor(hit, `${v.id}:ice`).slice(0, 10)) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.rotation.set(blob.angle, blob.reach, blob.land);
      this.scene.add(mesh);
      out.push({
        object: mesh,
        pose: (t) => {
          const q = gooAt(blob, t);
          const s = Math.max(1e-4, q.size * W * 1.6);
          mesh.visible = q.size > 0;
          mesh.scale.setScalar(s);
          mesh.position.set(v.at.x + q.x * W, v.at.y + q.y * W + s / 2, v.at.z + q.z * W);
          material.opacity = Math.min(1, (1.45 - t) / 0.3);
        },
      });
    }
    return out;
  }

  /** One piece of the character's own sprite, cut across the body: its top (side +1, flying off) or its bottom (−1, staying). */
  #half(v: Victim, h: Half, side: -1 | 1): Part {
    // the cut runs across the body, a little above its middle (the eggplant, HQ 2:03.0: the top, its cap with it, flies off
    // along the hit and comes down; the bottom stays where it stood). Cell fractions from its bottom; the stand row is v 0.5–1.
    const feet = 1 - v.anchor[1] / v.cell;
    const cut = feet + CUT_HEIGHT * (v.bodyHeight / v.spriteHeight);
    const top = side > 0;
    const texture = v.atlas.clone();
    texture.repeat.set(1 / 16, (top ? 1 - cut : cut) / 2);
    texture.offset.set(v.frame / 16, 0.5 + (top ? cut / 2 : 0));
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.05 }),
    );
    sprite.center.set(0.5, top ? 0 : feet / cut);
    sprite.scale.set(v.spriteHeight, v.spriteHeight * (top ? 1 - cut : cut), 1);
    sprite.renderOrder = 2;
    this.scene.add(sprite);
    const W = v.bodyHeight;
    const above = (cut - feet) * v.spriteHeight; // the cut, above the feet (scene)
    return {
      object: sprite,
      pose: (t) => {
        const p = halfAt(h, t);
        // the top comes down to the ground as it flies (≈ 0.35 s, its first stretch of the slide); the bottom stays standing
        const k = Math.min(1, Math.max(0, t) / 0.35);
        const lift = top ? above * (1 - k * k) : 0;
        sprite.position.set(v.at.x + p.position.x * W, v.at.y + lift, v.at.z + p.position.z * W);
        (sprite.material as THREE.SpriteMaterial).rotation = top ? p.tilt : 0;
      },
    };
  }

  /** Burnt: the whole body falls onto its side and lies there, its last flames going out (the video, 9:57.62–9:57.8). */
  #burnt(v: Victim): Part {
    const texture = v.atlas.clone();
    texture.repeat.set(1 / 16, 1 / 2);
    texture.offset.set(v.frame / 16, 0.5);
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.05 }),
    );
    sprite.center.set(v.anchor[0] / v.cell, 1 - v.anchor[1] / v.cell);
    sprite.scale.set(v.spriteHeight, v.spriteHeight, 1);
    sprite.renderOrder = 2;
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    );
    flame.renderOrder = 3;
    const group = new THREE.Group();
    group.add(sprite, flame);
    this.scene.add(group);
    const H = v.bodyHeight;
    return {
      object: group,
      pose: (t) => {
        sprite.position.copy(v.at);
        (sprite.material as THREE.SpriteMaterial).rotation = burntTilt(t);
        const f = v.videoSmoke === true ? undefined : lastFlames(t);
        flame.visible = f !== undefined;
        if (f !== undefined) {
          flame.position.set(v.at.x - 0.25 * H, v.at.y + 0.25 * H, v.at.z);
          flame.scale.setScalar(0.4 * H * f.size);
          (flame.material as THREE.MeshBasicMaterial).color.set(f.colour);
        }
      },
    };
  }

  /** A smoke ball rising off the burnt body. */
  #smoke(v: Victim, i: number): Part {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshBasicMaterial({
        color: FIRE_MOTION.death.smoke,
        transparent: true,
        depthWrite: false,
      }),
    );
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    const H = v.bodyHeight;
    return {
      object: mesh,
      pose: (t) => {
        const s = smokeBall(i, t);
        mesh.visible = s !== undefined;
        if (s === undefined) return;
        mesh.position.set(v.at.x + s.side * H, v.at.y + s.height * H, v.at.z);
        mesh.scale.setScalar(s.size * H);
        (mesh.material as THREE.MeshBasicMaterial).opacity = s.opacity;
      },
    };
  }

  /** The coffee on the ground: the splash, then the puddle (wider than deep). */
  #puddle(v: Victim, colour: number): Part {
    const mesh = this.#flat(colour, 0.9, 40);
    return {
      object: mesh,
      pose: (t) => {
        const r = Math.max(1e-3, this.length(puddleRadius(t)));
        mesh.position.set(v.at.x, 0.07, v.at.z);
        mesh.scale.set(r * Math.sqrt(PUDDLE.aspect), 1, r / Math.sqrt(PUDDLE.aspect));
      },
    };
  }

  #drop(v: Victim, d: ReturnType<typeof dropsFor>[number], colour: number): Part {
    const mesh = this.#flat(colour, 1, 12);
    const r = this.length(d.size);
    mesh.scale.set(r, 1, r);
    return {
      object: mesh,
      pose: (t) => {
        const p = dropAt(d, t);
        mesh.visible = p.visible;
        mesh.position.set(v.at.x + this.length(p.x), 0.08, v.at.z + this.length(p.z));
      },
    };
  }

  /** A ceramic shard: a small flat piece in the mug's colour, lying on the ground. */
  #shard(v: Victim, s: ReturnType<typeof shardsFor>[number]): Part {
    const a = this.length(s.size);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(a, a * 0.3, a * 0.6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(v.colour) }),
    );
    this.scene.add(mesh);
    return {
      object: mesh,
      pose: (t) => {
        const p = shardAt(s, t);
        mesh.position.set(v.at.x + this.length(p.x), a * 0.15, v.at.z + this.length(p.z));
        mesh.rotation.set(0, p.turn, 0);
      },
    };
  }

  /** One of a soft character's bits, in its colour, fading out. */
  #bit(v: Victim, b: ReturnType<typeof bitsFor>[number]): Part {
    const W = v.bodyHeight;
    const material = new THREE.MeshBasicMaterial({ color: v.colour, transparent: true });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.size * W, 8, 6), material);
    this.scene.add(mesh);
    return {
      object: mesh,
      pose: (t) => {
        const p = bitAt(b, t);
        mesh.visible = p.opacity > 0;
        material.opacity = p.opacity;
        mesh.position.set(v.at.x + p.x * W, b.size * W, v.at.z + p.z * W);
      },
    };
  }

  #flat(colour: number, opacity: number, segments: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, segments).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false }),
    );
    mesh.renderOrder = 0;
    this.scene.add(mesh);
    return mesh;
  }
}
