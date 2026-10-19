import * as THREE from 'three';
import { dropletsFor, halfAt, halvesFor, puddleRadius, type Half } from '../deathMotion';
import { debrisAt, debrisFor, type DebrisPiece } from '../propDebris';

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
  /** The mug: it shatters and spills coffee; everyone else splits in two. */
  readonly brittle: boolean;
}

interface Part {
  readonly object: THREE.Object3D;
  readonly pose: (t: number) => void;
}

/** The coffee in the mug (its darkest large colour). */
const COFFEE = 0x5b392a;

/**
 * A killed character's remains on the TV (owner's brief; the reference video at 0:07, 1:03, 2:21), moved by `render/deathMotion.ts`:
 * a soft character splits into its two halves (each half of its own sprite) that fly apart across the line of the hit, tumble,
 * land on their sides and slide to a stop, with a burst of droplets in its colour; the mug shatters into shards and leaves a
 * spreading puddle of coffee. They lie there until the character is back (a new round).
 */
export class DeathRemains {
  readonly #parts = new Map<string, { born: number; parts: Part[] }>();

  constructor(readonly scene: THREE.Scene) {}

  burst(v: Victim, hit: { x: number; z: number } | undefined, now: number): void {
    this.clear(v.id);
    const H = v.bodyHeight;
    const parts: Part[] = [];
    if (v.brittle) {
      for (const piece of debrisFor('POT', hit, v.id)) parts.push(this.#piece(v, piece, H * 0.8));
      const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: COFFEE,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      );
      puddle.renderOrder = 0;
      this.scene.add(puddle);
      parts.push({
        object: puddle,
        pose: (t) => {
          const r = Math.max(1e-3, puddleRadius(t) * H);
          puddle.position.set(v.at.x, 0.07, v.at.z);
          puddle.scale.set(r, 1, r * 0.8);
        },
      });
    } else {
      const [left, right] = halvesFor(hit, v.id);
      parts.push(this.#half(v, left, -1), this.#half(v, right, 1));
      for (const drop of dropletsFor(hit, v.id)) parts.push(this.#piece(v, drop, H));
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

  /** One half of the character's own sprite: its left (side −1) or right (+1) half of the frame it showed. */
  #half(v: Victim, h: Half, side: -1 | 1): Part {
    const texture = v.atlas.clone();
    texture.repeat.set(1 / 32, 1 / 2);
    texture.offset.set(v.frame / 16 + (side > 0 ? 1 / 32 : 0), 0.5);
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.05 }),
    );
    // the cut runs through the feet: each half turns about its own edge of the cut, at the feet
    sprite.center.set(side < 0 ? 1 : 0, 1 - v.anchor[1] / v.cell);
    sprite.scale.set(v.spriteHeight / 2, v.spriteHeight, 1);
    sprite.renderOrder = 2;
    this.scene.add(sprite);
    const H = v.bodyHeight;
    return {
      object: sprite,
      pose: (t) => {
        const p = halfAt(h, t);
        sprite.position.set(
          v.at.x + p.position.x * H,
          v.at.y + p.position.y * H,
          v.at.z + p.position.z * H,
        );
        (sprite.material as THREE.SpriteMaterial).rotation = p.tilt;
      },
    };
  }

  /** A shard or a droplet (prop-debris motion), in the character's colour. */
  #piece(v: Victim, piece: DebrisPiece, scale: number): Part {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(piece.size.x * scale, piece.size.y * scale, piece.size.z * scale),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(v.colour).multiplyScalar(piece.shade),
      }),
    );
    this.scene.add(mesh);
    return {
      object: mesh,
      pose: (t) => {
        const p = debrisAt(piece, t);
        mesh.position.set(
          v.at.x + p.position.x * scale,
          p.position.y * scale,
          v.at.z + p.position.z * scale,
        );
        mesh.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z);
      },
    };
  }
}
