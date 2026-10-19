import * as THREE from 'three';
import { debrisAt, debrisFor, type DebrisKind, type DebrisPiece } from '../propDebris';
import type { ArenaView } from '../viewModel';
import type { sceneSpace } from './plazaSpace';

interface Piece {
  readonly mesh: THREE.Mesh;
  readonly piece: DebrisPiece;
  readonly born: number;
  readonly origin: THREE.Vector3;
  readonly scale: number;
}

/**
 * The plaza's breakable props as drawn (the rules decide what breaks; this only shows it). A prop's model is the glTF node
 * named like its id (with any top-level part named `<id>_…`, such as a pot's mouth). When one breaks it disappears and bursts into pieces of its own colour (render/propDebris.ts) that land and
 * stay on the ground; a crate stacked on a broken one goes with it. A new round, which starts with nothing broken, puts every
 * model back and clears the pieces.
 */
const boxOf = (parts: readonly THREE.Object3D[]): THREE.Box3 =>
  parts.reduce((b, o) => b.union(new THREE.Box3().setFromObject(o)), new THREE.Box3());

export class PlazaProps {
  /** Each prop's model: the node named like it, plus any top-level part named `<it>_…` (a pot's mouth). */
  readonly #models = new Map<string, THREE.Object3D[]>();
  /** Models resting on others (not in the rules: they stand on no ground), and what they rest on. */
  readonly #stackedOn = new Map<string, string[]>();
  readonly #gone = new Set<string>();
  readonly #pieces: Piece[] = [];

  constructor(
    readonly scene: THREE.Scene,
    root: THREE.Object3D,
    readonly space: ReturnType<typeof sceneSpace>,
    readonly gradient: THREE.Texture,
  ) {
    const nodes = root.children.filter((o) => /^(CRATE|POT)_/.test(o.name));
    for (const o of nodes) {
      const owner = nodes.find((n) => n !== o && o.name.startsWith(`${n.name}_`));
      const id = owner?.name ?? o.name;
      this.#models.set(id, [...(this.#models.get(id) ?? []), o]);
    }
    const boxes = new Map([...this.#models].map(([id, parts]) => [id, boxOf(parts)]));
    for (const [id, box] of boxes) {
      if (box.min.y < 0.5) continue; // standing on the ground
      const under = [...boxes]
        .filter(
          ([other, b]) =>
            other !== id &&
            Math.abs(b.max.y - box.min.y) < 0.5 &&
            b.max.x > box.min.x &&
            b.min.x < box.max.x &&
            b.max.z > box.min.z &&
            b.min.z < box.max.z,
        )
        .map(([other]) => other);
      if (under.length > 0) this.#stackedOn.set(id, under);
    }
  }

  /** Brings the drawing in line with the view's broken props, bursting the ones that broke on this view's step. */
  show(view: ArenaView, now: number): void {
    const broken = new Set(view.broken);
    for (const [id, under] of this.#stackedOn) if (under.some((u) => broken.has(u))) broken.add(id);
    if ([...this.#gone].some((id) => !broken.has(id))) this.#reset();
    for (const id of broken) {
      if (this.#gone.has(id)) continue;
      const model = this.#models.get(id);
      if (model === undefined) continue;
      this.#gone.add(id);
      const why =
        view.events.find((e) => e.type === 'PROP_BROKEN' && e.propId === id) ??
        view.events.find(
          (e) =>
            e.type === 'PROP_BROKEN' && this.#stackedOn.get(id)?.includes(e.propId ?? '') === true,
        );
      this.#burst(id, model, why?.from, now);
      for (const part of model) part.visible = false;
    }
  }

  frame(now: number): void {
    for (const p of this.#pieces) {
      const pose = debrisAt(p.piece, Math.max(0, now - p.born) / 1000);
      p.mesh.position.set(
        p.origin.x + pose.position.x * p.scale,
        p.origin.y + pose.position.y * p.scale,
        p.origin.z + pose.position.z * p.scale,
      );
      p.mesh.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z);
    }
  }

  #burst(
    id: string,
    model: readonly THREE.Object3D[],
    from: { x: number; y: number } | undefined,
    now: number,
  ): void {
    const box = boxOf(model);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = Math.max(size.x, size.z);
    const origin = new THREE.Vector3(centre.x, box.min.y, centre.z);
    let away: { x: number; z: number } | undefined;
    if (from !== undefined) {
      const f = this.space.toScene(from.x, from.y);
      const d = Math.hypot(centre.x - f.x, centre.z - f.z);
      if (d > 1e-6) away = { x: (centre.x - f.x) / d, z: (centre.z - f.z) / d };
    }
    // its own colour: that of its biggest part (a pot's body, not the dark inside of its mouth; a crate's panels)
    let colour: THREE.Color | undefined;
    let biggest = -1;
    for (const part of model)
      part.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !('color' in o.material)) return;
        const v = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
        const volume = v.x * v.y * v.z + 1e-6 * (v.x + v.y + v.z); // a flat part still counts, a little
        if (volume > biggest) {
          biggest = volume;
          colour = (o.material as THREE.MeshToonMaterial).color;
        }
      });
    const base = colour ?? new THREE.Color(0x9b6a4a);
    const kind: DebrisKind = id.startsWith('POT_') ? 'POT' : 'CRATE';
    for (const piece of debrisFor(kind, away, id)) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(piece.size.x * scale, piece.size.y * scale, piece.size.z * scale),
        new THREE.MeshToonMaterial({
          color: base.clone().multiplyScalar(piece.shade),
          gradientMap: this.gradient,
        }),
      );
      mesh.name = `DEBRIS_${id}`;
      this.scene.add(mesh);
      this.#pieces.push({ mesh, piece, born: now, origin, scale });
    }
    this.frame(now);
  }

  #reset(): void {
    for (const p of this.#pieces) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.#pieces.length = 0;
    for (const id of this.#gone) for (const part of this.#models.get(id) ?? []) part.visible = true;
    this.#gone.clear();
  }

  /** Test hook: which props are drawn broken, and how many pieces lie about. */
  drawn(): { readonly broken: readonly string[]; readonly pieces: number } {
    return {
      broken: [...this.#gone].sort(),
      pieces: this.#pieces.length,
    };
  }
}
