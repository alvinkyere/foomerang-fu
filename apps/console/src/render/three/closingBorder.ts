import * as THREE from 'three';
import type { RectView } from '../viewModel';

/**
 * BATTLE_ROYALE's border closing in, as the reference video draws it (4:37.7–4:46.0): a black dashed line round the safe zone
 * with a pink glow just outside it (sampled ≈ #eea8b9). Presentation only: the rules own where it is (battleRoyale.ts).
 */
export const CLOSING_LOOK = Object.freeze({ glow: '#eea8b9', glowWidth: 60, line: '#1d1d24' });

type ToScene = (x: number, y: number) => { x: number; z: number };

export class ClosingBorder {
  readonly #line: THREE.LineLoop;
  readonly #glow: THREE.Mesh[];

  constructor(readonly scene: THREE.Scene) {
    this.#line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 4 }, () => new THREE.Vector3()),
      ),
      new THREE.LineDashedMaterial({ color: CLOSING_LOOK.line, dashSize: 1.2, gapSize: 0.9 }),
    );
    this.#glow = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: CLOSING_LOOK.glow,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      m.renderOrder = 1;
      return m;
    });
    this.#line.visible = false;
    for (const g of this.#glow) g.visible = false;
    scene.add(this.#line, ...this.#glow);
  }

  show(zone: RectView | undefined, toScene: ToScene): void {
    const on = zone !== undefined;
    this.#line.visible = on;
    for (const g of this.#glow) g.visible = on;
    if (zone === undefined) return;
    const corners = [
      toScene(zone.x, zone.y),
      toScene(zone.x + zone.width, zone.y),
      toScene(zone.x + zone.width, zone.y + zone.height),
      toScene(zone.x, zone.y + zone.height),
    ];
    this.#line.geometry.setFromPoints(corners.map((c) => new THREE.Vector3(c.x, 0.12, c.z)));
    this.#line.computeLineDistances();
    // a band just outside each side
    const w = CLOSING_LOOK.glowWidth;
    const bands: [number, number, number, number][] = [
      [zone.x - w, zone.y - w, zone.width + 2 * w, w],
      [zone.x - w, zone.y + zone.height, zone.width + 2 * w, w],
      [zone.x - w, zone.y, w, zone.height],
      [zone.x + zone.width, zone.y, w, zone.height],
    ];
    bands.forEach(([x, y, bw, bh], k) => {
      const a = toScene(x, y);
      const b = toScene(x + bw, y + bh);
      const m = this.#glow[k] as THREE.Mesh;
      m.position.set((a.x + b.x) / 2, 0.1, (a.z + b.z) / 2);
      m.scale.set(Math.abs(b.x - a.x), 1, Math.abs(b.z - a.z));
    });
  }
}
