import * as THREE from 'three';
import { EXPLOSION_SECONDS, explosionAt, shakeAt } from '../explosionMotion';

/** Fire balls and puffs at most in one blast (explosionMotion.ts makes 21–35 balls, 6 puffs). */
const BALLS = 36;
const PUFFS = 6;
const RING_SEGMENTS = 72;

interface Live {
  readonly at: THREE.Vector3;
  /** The blast radius (scene units): R, the ring's final radius, which kills. */
  readonly radius: number;
  readonly born: number;
  readonly seed: number;
  readonly group: THREE.Group;
  readonly white: THREE.Mesh;
  readonly dome: THREE.Mesh;
  readonly ring: THREE.Mesh;
  readonly balls: THREE.Mesh[];
  readonly puffs: THREE.Mesh[];
}

const basic = (colour: string, transparent = false): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color: colour, transparent, depthWrite: !transparent });

/**
 * The ring on the ground, its band solid at the outside and fading inwards (the HQ's: a bright edge, see-through within). Rebuilt each
 * frame from explosionMotion's inner and outer edges; colours carry the alpha.
 */
function ringGeometry(
  inner: number,
  outer: number,
  colour: THREE.Color,
  opacity: number,
): THREE.BufferGeometry {
  const band = Math.min(outer - inner, Math.max(0.08, (outer - inner) * 0.45));
  const radii = [inner, Math.max(inner, outer - band), outer];
  const alphas = inner <= 0.001 ? [0.35, 1, 1] : [0, 1, 1];
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s <= RING_SEGMENTS; s += 1) {
    const a = (s / RING_SEGMENTS) * Math.PI * 2;
    radii.forEach((r, k) => {
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      col.push(colour.r, colour.g, colour.b, (alphas[k] ?? 1) * opacity);
    });
  }
  for (let s = 0; s < RING_SEGMENTS; s += 1)
    for (let k = 0; k < 2; k += 1) {
      const a = s * 3 + k;
      const b = (s + 1) * 3 + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

/**
 * Explosive boomerangs' blasts on the TV, as the HQ video draws them (render/explosionMotion.ts, measured every frame): a faceted white
 * ball, a see-through yellow dome, the ring on the ground out to the radius that kills, faceted fire balls cooling to smoke, pale puffs;
 * and the screen's shake (`shake`). Our own geometry, never the video's pixels.
 */
export class Blasts {
  readonly #live: Live[] = [];
  #seed = 1;

  constructor(readonly scene: THREE.Scene) {}

  burst(at: THREE.Vector3, radius: number, now: number): void {
    const group = new THREE.Group();
    group.position.copy(at);
    const white = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), basic('#ffffff'));
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      basic('#fdfd8c', true),
    );
    const ring = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    );
    ring.position.y = radius * 0.01;
    const ballGeometry = new THREE.IcosahedronGeometry(1, 0);
    const balls = Array.from(
      { length: BALLS },
      // (faceted and lit, as the HQ's: flat-shaded faces catching the light; emissive keeps the measured colour on the lit side)
      () =>
        new THREE.Mesh(
          ballGeometry,
          new THREE.MeshLambertMaterial({
            color: '#e44908',
            emissive: '#e44908',
            emissiveIntensity: 0.55,
            flatShading: true,
          }),
        ),
    );
    const puffGeometry = new THREE.IcosahedronGeometry(1, 1);
    const puffs = Array.from(
      { length: PUFFS },
      () => new THREE.Mesh(puffGeometry, basic('#fbf6d6', true)),
    );
    for (const m of [ring, dome, white, ...balls, ...puffs]) {
      m.renderOrder = 3;
      group.add(m);
    }
    this.scene.add(group);
    this.#seed += 1;
    this.#live.push({
      at,
      radius,
      born: now,
      seed: this.#seed,
      group,
      white,
      dome,
      ring,
      balls,
      puffs,
    });
    this.frame(now);
  }

  frame(now: number): void {
    for (let i = this.#live.length - 1; i >= 0; i -= 1) {
      const b = this.#live[i] as Live;
      const t = (now - b.born) / 1000;
      if (t >= EXPLOSION_SECONDS) {
        this.#dispose(b);
        this.#live.splice(i, 1);
        continue;
      }
      const pose = explosionAt(t, b.seed);
      const R = b.radius;
      b.white.visible = pose.white !== undefined;
      if (pose.white) {
        b.white.scale.setScalar(pose.white.radius * R);
        b.white.position.y = pose.white.radius * R * 0.6;
      }
      b.dome.visible = pose.dome !== undefined;
      if (pose.dome) {
        b.dome.scale.set(pose.dome.radius * R, pose.dome.radius * R * 0.55, pose.dome.radius * R);
        (b.dome.material as THREE.MeshBasicMaterial).opacity = pose.dome.opacity;
      }
      b.ring.visible = pose.ring !== undefined;
      if (pose.ring) {
        b.ring.geometry.dispose();
        b.ring.geometry = ringGeometry(
          pose.ring.inner * R,
          pose.ring.outer * R,
          new THREE.Color(pose.ring.colour),
          pose.ring.opacity,
        );
      }
      b.balls.forEach((mesh, k) => {
        const s = pose.balls[k];
        mesh.visible = s !== undefined;
        if (s === undefined) return;
        mesh.position.set(s.x * R, s.y * R, s.z * R);
        mesh.scale.setScalar(s.size * R);
        mesh.rotation.set(k * 1.7, k * 2.3, 0);
        const m = mesh.material as THREE.MeshLambertMaterial;
        m.color.set(s.colour);
        m.emissive.set(s.colour);
      });
      b.puffs.forEach((mesh, k) => {
        const s = pose.puffs[k];
        mesh.visible = s !== undefined;
        if (s === undefined) return;
        mesh.position.set(s.x * R, s.y * R, s.z * R);
        mesh.scale.setScalar(s.size * R);
        (mesh.material as THREE.MeshBasicMaterial).opacity = s.opacity;
      });
    }
  }

  /** The screen's shake now (fractions of its height), the blasts' together. */
  shake(now: number): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const b of this.#live) {
      const s = shakeAt((now - b.born) / 1000);
      x += s.x;
      y += s.y;
    }
    return { x, y };
  }

  #dispose(b: Live): void {
    this.scene.remove(b.group);
    const geometries = new Set<THREE.BufferGeometry>();
    b.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        (o.material as THREE.Material).dispose();
      }
    });
    for (const g of geometries) g.dispose();
  }
}
