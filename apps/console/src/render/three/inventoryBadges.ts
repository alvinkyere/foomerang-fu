import type * as THREE from 'three';
import type { PowerKind } from '@foomerang/foomerang-fu';
import { BADGE_ICON, POWER_BADGE } from '../powerBadge';

interface Row {
  readonly el: HTMLDivElement;
  key: string;
}

/**
 * The powers a player owns, as the HQ videos show them in every match (10:37-10:44 of the HQ, 6:00 of the physics HQ): a row of
 * small round badges in each power's colour with its white icon, over the player's head, oldest first, for as long as they own
 * them (they go when the power does, or when the player is out). Drawn in the page over the canvas so the icons stay crisp. The
 * name bar that appears for ~2 s on taking a Book is `PickupBadges`; this row is what stays.
 */
export class InventoryBadges {
  readonly #rows = new Map<string, Row>();

  constructor(
    readonly container: HTMLElement,
    readonly canvas: HTMLCanvasElement,
  ) {}

  /**
   * Holds each living player's row over their head. `owned`: who has what (the rules' inventory); `head`: the scene point above a
   * player (undefined: not drawn).
   */
  frame(
    camera: THREE.Camera,
    owned: readonly {
      readonly id: string;
      readonly powers: readonly PowerKind[];
      readonly dead: boolean;
    }[],
    head: (id: string) => THREE.Vector3 | undefined,
  ): void {
    const seen = new Set<string>();
    const size = Math.max(18, this.canvas.clientHeight * 0.031);
    for (const p of owned) {
      const at = head(p.id);
      if (p.dead || p.powers.length === 0 || at === undefined) continue;
      seen.add(p.id);
      let row = this.#rows.get(p.id);
      if (row === undefined) {
        const el = document.createElement('div');
        Object.assign(el.style, {
          position: 'absolute',
          transform: 'translate(-50%, -100%)',
          display: 'flex',
          gap: '3px',
          pointerEvents: 'none',
          zIndex: '2',
        });
        el.dataset['inventory'] = p.id;
        this.container.appendChild(el);
        row = { el, key: '' };
        this.#rows.set(p.id, row);
      }
      const key = `${p.powers.join(',')}|${Math.round(size)}`;
      if (key !== row.key) {
        row.key = key;
        row.el.replaceChildren(...p.powers.map((kind) => disc(kind, size)));
      }
      const v = at.clone().project(camera);
      row.el.style.left = `${this.canvas.offsetLeft + ((v.x + 1) / 2) * this.canvas.clientWidth}px`;
      row.el.style.top = `${this.canvas.offsetTop + ((1 - v.y) / 2) * this.canvas.clientHeight - size * 0.25}px`;
    }
    for (const [id, row] of [...this.#rows])
      if (!seen.has(id)) {
        row.el.remove();
        this.#rows.delete(id);
      }
  }

  destroy(): void {
    for (const row of this.#rows.values()) row.el.remove();
    this.#rows.clear();
  }
}

function disc(kind: PowerKind, size: number): HTMLDivElement {
  const badge = POWER_BADGE[kind];
  const el = document.createElement('div');
  el.dataset['power'] = kind;
  el.title = badge.name;
  Object.assign(el.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: badge.colour,
    display: 'grid',
    placeItems: 'center',
    boxShadow: '0 1px 3px rgb(0 0 0 / 0.18)',
  });
  if (badge.icon !== undefined)
    el.innerHTML = `<svg width="${size * 0.64}" height="${size * 0.64}" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="${BADGE_ICON[badge.icon]}"/></svg>`;
  return el;
}
