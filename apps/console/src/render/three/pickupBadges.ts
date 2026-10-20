import type * as THREE from 'three';
import type { PowerKind } from '@foomerang/foomerang-fu';
import { BADGE_ICON, PICKUP_LABEL_SECONDS, POWER_BADGE } from '../powerBadge';

interface Shown {
  readonly el: HTMLDivElement;
  readonly actor: string;
  readonly born: number;
}

/**
 * The badge over a player who has just taken a power Book (the reference video, 4:11 and 10:15; render/powerBadge.ts): a disc
 * with the power's white icon above a bar with its name in white capitals, both in the power's colour, held over the player's
 * head for PICKUP_LABEL_SECONDS. Drawn in the page over the canvas, so the lettering stays crisp.
 */
export class PickupBadges {
  readonly #shown: Shown[] = [];

  constructor(
    readonly container: HTMLElement,
    readonly canvas: HTMLCanvasElement,
  ) {}

  show(actor: string, kind: PowerKind, now: number): void {
    // a new one replaces the player's last
    for (const s of this.#shown.filter((x) => x.actor === actor)) this.#remove(s);
    const badge = POWER_BADGE[kind];
    const el = document.createElement('div');
    el.dataset['badge'] = kind;
    Object.assign(el.style, {
      position: 'absolute',
      transform: 'translate(-50%, -100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      pointerEvents: 'none',
      zIndex: '3',
    });
    const disc = document.createElement('div');
    Object.assign(disc.style, {
      width: '30px',
      height: '30px',
      borderRadius: '50%',
      background: badge.colour,
      display: 'grid',
      placeItems: 'center',
    });
    disc.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="${BADGE_ICON[badge.icon]}"/></svg>`;
    const bar = document.createElement('div');
    bar.textContent = badge.name;
    Object.assign(bar.style, {
      background: badge.colour,
      color: '#fff',
      font: "900 20px ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif",
      letterSpacing: '0.04em',
      padding: '2px 9px',
      whiteSpace: 'nowrap',
    });
    el.append(disc, bar);
    this.container.appendChild(el);
    this.#shown.push({ el, actor, born: now });
  }

  /** Holds every badge over its player's head (`head`: the scene point above them, undefined if they are gone). */
  frame(now: number, camera: THREE.Camera, head: (id: string) => THREE.Vector3 | undefined): void {
    for (const s of [...this.#shown]) {
      const at = head(s.actor);
      if (now - s.born >= PICKUP_LABEL_SECONDS * 1000 || at === undefined) {
        this.#remove(s);
        continue;
      }
      const p = at.clone().project(camera);
      const x = this.canvas.offsetLeft + ((p.x + 1) / 2) * this.canvas.clientWidth;
      const y = this.canvas.offsetTop + ((1 - p.y) / 2) * this.canvas.clientHeight;
      s.el.style.left = `${x}px`;
      s.el.style.top = `${y}px`;
    }
  }

  #remove(s: Shown): void {
    s.el.remove();
    this.#shown.splice(this.#shown.indexOf(s), 1);
  }
}
