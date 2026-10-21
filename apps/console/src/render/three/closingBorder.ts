import * as THREE from 'three';
import { BATTLE_ROYALE_HOLD } from '@foomerang/foomerang-fu';
import type { RectView } from '../viewModel';

/**
 * BATTLE_ROYALE's border, as the reference video draws and animates it (read every frame, 4:36.98–4:39.0): at the take a pink
 * glow (≈ #eea8b9 over water; it tints what it lies on) fades in just outside the arena's border over 0.05–0.2 s; at the hold's
 * end (0.9 s) the black dashed line appears on the border and the two close in together. The glow is strongest at the line and
 * fades outward over ≈ 1.3 character widths. Presentation only: the rules own where it is (battleRoyale.ts).
 */
export const CLOSING_LOOK = Object.freeze({
  glow: '#eea8b9',
  glowWidth: 60,
  line: '#1d1d24',
  glowFrom: 0.05,
  glowFull: 0.2,
  /** The glow's opacity at the line (it fades to nothing at glowWidth). */
  glowOpacity: 0.75,
});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The glow's opacity and whether the dashed line shows, `seconds` after the take. */
export function closingLookAt(seconds: number): { readonly glow: number; readonly line: boolean } {
  const c = CLOSING_LOOK;
  return {
    glow: c.glowOpacity * clamp01((seconds - c.glowFrom) / (c.glowFull - c.glowFrom)),
    line: seconds >= BATTLE_ROYALE_HOLD,
  };
}

type ToScene = (x: number, y: number) => { x: number; z: number };

/** A strip of glow: opaque at its inner edge (v = 0), fading to nothing at its outer edge (v = 1). */
function fadeTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g !== null) {
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

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
    const fade = typeof document === 'undefined' ? null : fadeTexture();
    // one strip per side (top, bottom, left, right; scene z grows with world y): each is turned so that its opaque edge (the
    // strip's local −z) faces the line and it fades outward
    this.#glow = [Math.PI, 0, -Math.PI / 2, Math.PI / 2].map((turn) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).rotateY(turn),
        new THREE.MeshBasicMaterial({
          color: CLOSING_LOOK.glow,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          ...(fade === null ? {} : { alphaMap: fade }),
        }),
      );
      m.renderOrder = 1;
      return m;
    });
    this.#line.visible = false;
    for (const g of this.#glow) g.visible = false;
    scene.add(this.#line, ...this.#glow);
  }

  show(zone: (RectView & { readonly seconds: number }) | undefined, toScene: ToScene): void {
    const look = zone === undefined ? undefined : closingLookAt(zone.seconds);
    this.#line.visible = look?.line === true;
    for (const g of this.#glow) g.visible = look !== undefined && look.glow > 0;
    if (zone === undefined || look === undefined) return;
    const corners = [
      toScene(zone.x, zone.y),
      toScene(zone.x + zone.width, zone.y),
      toScene(zone.x + zone.width, zone.y + zone.height),
      toScene(zone.x, zone.y + zone.height),
    ];
    this.#line.geometry.setFromPoints(corners.map((c) => new THREE.Vector3(c.x, 0.12, c.z)));
    this.#line.computeLineDistances();
    // a band just outside each side: top, bottom, left, right
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
      // (a unit square, turned in its own plane: still the same square, so it scales along the scene's axes)
      m.scale.set(Math.abs(b.x - a.x), 1, Math.abs(b.z - a.z));
      (m.material as THREE.MeshBasicMaterial).opacity = look.glow;
    });
  }
}
