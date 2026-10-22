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
}

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

  constructor(
    readonly scene: THREE.Scene,
    /** A length in world units -> scene units. */
    readonly length: (worldUnits: number) => number,
  ) {}

  burst(v: Victim, hit: { x: number; z: number } | undefined, now: number): void {
    this.clear(v.id);
    const parts: Part[] = [];
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
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          o.geometry.dispose();
          const m = o.material as THREE.Material & { map?: THREE.Texture | null };
          m.map?.dispose();
          m.dispose();
        }
      });
    }
    this.#parts.delete(id);
  }

  has(id: string): boolean {
    return this.#parts.has(id);
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
