import * as Phaser from 'phaser';
import type { ArenaRenderer, DrawnCircle } from '../renderer';
import type { ArenaView, BoomerangView, CircleView, ViewEvent } from '../viewModel';

/**
 * THE Phaser module. It is the only file that imports Phaser (lint-enforced) and it is loaded
 * lazily, so a lobby never downloads it. It draws an ArenaView; it holds no simulation state, runs
 * no physics and never moves anything on its own: every position on screen was handed to it.
 *
 * Everything animated here (spin, trail, flashes, fades) is PRESENTATION: derived from the view,
 * timed by Phaser's own clock, and never read back by the rules.
 */

const DIMMED_ALPHA = 0.35;
const OUTLINE = 0xffffff;
const TRAIL_LENGTH = 9;

const toNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

class PlayerSprite {
  readonly container: Phaser.GameObjects.Container;
  readonly #shape: Phaser.GameObjects.Graphics;
  readonly #aim: Phaser.GameObjects.Graphics;
  readonly #mark: Phaser.GameObjects.Graphics;
  readonly #number: Phaser.GameObjects.Text;
  readonly #name: Phaser.GameObjects.Text;
  #styleKey = '';
  #aimKey = '';

  constructor(scene: Phaser.Scene) {
    this.#shape = scene.add.graphics();
    this.#aim = scene.add.graphics();
    this.#mark = scene.add.graphics();
    this.#number = scene.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#000000',
      })
      .setOrigin(0.5);
    this.#name = scene.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0);
    this.container = scene.add.container(0, 0, [
      this.#shape,
      this.#aim,
      this.#number,
      this.#name,
      this.#mark,
    ]);
  }

  apply(circle: CircleView): void {
    this.container.setPosition(circle.x, circle.y);
    this.container.setAlpha(circle.dimmed ? DIMMED_ALPHA : 1);

    const key = `${circle.shape}|${circle.color}|${circle.radius}|${circle.number}|${circle.label}`;
    if (key !== this.#styleKey) {
      this.#styleKey = key;
      this.#draw(circle);
      this.#number.setText(circle.number > 0 ? String(circle.number) : '');
      this.#name.setText(circle.label).setY(circle.radius + 6);
    }

    // Aim indicator: where a throw would go. Solid when the boomerang is in hand, a faint outline
    // while it is away.
    const aimKey = `${circle.facing?.x}|${circle.facing?.y}|${circle.armed}|${circle.dead}|${circle.radius}`;
    if (aimKey !== this.#aimKey) {
      this.#aimKey = aimKey;
      this.#drawAim(circle);
      this.#drawMark(circle);
    }
  }

  #drawAim(circle: CircleView): void {
    const g = this.#aim;
    g.clear();
    if (circle.facing === undefined || circle.dead) return;
    const r = circle.radius;
    const angle = Math.atan2(circle.facing.y, circle.facing.x);
    const tip = r + 26;
    const base = r + 6;
    const spread = 0.42;
    const points = [
      new Phaser.Math.Vector2(Math.cos(angle) * tip, Math.sin(angle) * tip),
      new Phaser.Math.Vector2(Math.cos(angle + spread) * base, Math.sin(angle + spread) * base),
      new Phaser.Math.Vector2(Math.cos(angle - spread) * base, Math.sin(angle - spread) * base),
    ];
    if (circle.armed) {
      g.fillStyle(OUTLINE, 0.95);
      g.fillPoints(points, true);
    } else {
      g.lineStyle(3, OUTLINE, 0.45);
      g.strokePoints(points, true);
    }
  }

  #drawMark(circle: CircleView): void {
    const g = this.#mark;
    g.clear();
    if (!circle.dead) return;
    const r = circle.radius * 0.8;
    g.lineStyle(10, 0x000000, 0.9);
    g.lineBetween(-r, -r, r, r);
    g.lineBetween(-r, r, r, -r);
    g.lineStyle(5, OUTLINE, 0.95);
    g.lineBetween(-r, -r, r, r);
    g.lineBetween(-r, r, r, -r);
  }

  #draw(circle: CircleView): void {
    const g = this.#shape;
    const r = circle.radius;
    g.clear();
    g.fillStyle(toNumber(circle.color), 1);
    g.lineStyle(5, OUTLINE, 1);
    switch (circle.shape) {
      case 'circle':
        g.fillCircle(0, 0, r);
        g.strokeCircle(0, 0, r);
        break;
      case 'square':
        g.fillRect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
        g.strokeRect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
        break;
      case 'triangle':
        g.fillTriangle(0, -r, r * 0.95, r * 0.8, -r * 0.95, r * 0.8);
        g.strokeTriangle(0, -r, r * 0.95, r * 0.8, -r * 0.95, r * 0.8);
        break;
      case 'diamond':
        g.fillTriangle(0, -r, r, 0, -r, 0);
        g.fillTriangle(0, r, r, 0, -r, 0);
        g.strokePoints(
          [
            new Phaser.Math.Vector2(0, -r),
            new Phaser.Math.Vector2(r, 0),
            new Phaser.Math.Vector2(0, r),
            new Phaser.Math.Vector2(-r, 0),
          ],
          true,
        );
        break;
      case 'star': {
        const points: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < 10; i += 1) {
          const radius = i % 2 === 0 ? r : r * 0.45;
          const angle = (Math.PI / 5) * i - Math.PI / 2;
          points.push(new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
        }
        g.fillPoints(points, true);
        g.strokePoints(points, true);
        break;
      }
      case 'cross':
        g.fillRect(-r * 0.35, -r, r * 0.7, r * 2);
        g.fillRect(-r, -r * 0.35, r * 2, r * 0.7);
        g.strokeRect(-r * 0.35, -r, r * 0.7, r * 2);
        g.strokeRect(-r, -r * 0.35, r * 2, r * 0.7);
        break;
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}

/** A flying boomerang: a spinning chevron in its owner's colour with a fading trail behind it. */
class BoomerangSprite {
  readonly container: Phaser.GameObjects.Container;
  readonly #body: Phaser.GameObjects.Graphics;
  readonly #trail: Phaser.GameObjects.Graphics;
  readonly #history: { x: number; y: number }[] = [];
  #drawnKey = '';
  #color = 0xffffff;
  #radius = 14;

  constructor(scene: Phaser.Scene) {
    this.#trail = scene.add.graphics();
    this.#body = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.#body]);
  }

  apply(view: BoomerangView): void {
    this.container.setPosition(view.x, view.y);
    this.#color = toNumber(view.color);
    this.#radius = view.radius;
    const key = `${view.color}|${view.radius}`;
    if (key !== this.#drawnKey) {
      this.#drawnKey = key;
      this.#drawBody();
    }
    const last = this.#history.at(-1);
    if (last === undefined || last.x !== view.x || last.y !== view.y) {
      this.#history.push({ x: view.x, y: view.y });
      if (this.#history.length > TRAIL_LENGTH) this.#history.shift();
    }
    this.#drawTrail();
  }

  spin(time: number): void {
    this.container.setRotation(time / 55);
  }

  #drawBody(): void {
    const g = this.#body;
    const r = this.#radius * 1.7;
    g.clear();
    g.lineStyle(this.#radius * 0.95 + 6, OUTLINE, 1);
    g.lineBetween(-r * 0.7, -r * 0.9, 0, 0);
    g.lineBetween(0, 0, -r * 0.7, r * 0.9);
    g.lineStyle(this.#radius * 0.95, this.#color, 1);
    g.lineBetween(-r * 0.7, -r * 0.9, 0, 0);
    g.lineBetween(0, 0, -r * 0.7, r * 0.9);
  }

  #drawTrail(): void {
    const g = this.#trail;
    g.clear();
    const count = this.#history.length;
    this.#history.forEach((point, index) => {
      const t = (index + 1) / count;
      g.fillStyle(this.#color, 0.45 * t);
      g.fillCircle(point.x, point.y, this.#radius * (0.35 + 0.5 * t));
    });
  }

  destroy(): void {
    this.#trail.destroy();
    this.container.destroy();
  }
}

interface Effect {
  readonly graphics: Phaser.GameObjects.Graphics;
  readonly born: number;
  readonly duration: number;
  readonly update: (g: Phaser.GameObjects.Graphics, progress: number) => void;
}

class ArenaScene extends Phaser.Scene {
  readonly #sprites = new Map<string, PlayerSprite>();
  readonly #boomerangs = new Map<string, BoomerangSprite>();
  #effects: Effect[] = [];
  #banner: Phaser.GameObjects.Text | undefined;
  #roundLabel: Phaser.GameObjects.Text | undefined;
  #ready: (() => void) | undefined;

  constructor(ready: () => void) {
    super('arena');
    this.#ready = ready;
  }

  create(): void {
    this.#banner = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '84px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setVisible(false);
    this.#roundLabel = this.add
      .text(24, 18, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '30px',
        color: '#9aa7b6',
      })
      .setDepth(10);
    this.#ready?.();
    this.#ready = undefined;
  }

  show(view: ArenaView): void {
    if (this.sys === undefined || !this.sys.isActive()) return;

    const present = new Set<string>();
    for (const circle of view.circles) {
      present.add(circle.id);
      let sprite = this.#sprites.get(circle.id);
      if (sprite === undefined) {
        sprite = new PlayerSprite(this);
        this.#sprites.set(circle.id, sprite);
      }
      sprite.apply(circle);
    }
    for (const [id, sprite] of this.#sprites) {
      if (!present.has(id)) {
        sprite.destroy();
        this.#sprites.delete(id);
      }
    }

    const flying = new Set<string>();
    for (const boomerang of view.boomerangs) {
      flying.add(boomerang.ownerId);
      let sprite = this.#boomerangs.get(boomerang.ownerId);
      if (sprite === undefined) {
        sprite = new BoomerangSprite(this);
        this.#boomerangs.set(boomerang.ownerId, sprite);
      }
      sprite.apply(boomerang);
    }
    for (const [id, sprite] of this.#boomerangs) {
      if (!flying.has(id)) {
        sprite.destroy();
        this.#boomerangs.delete(id);
      }
    }

    for (const event of view.events) this.#spawnEffect(event);

    if (this.#banner !== undefined) {
      this.#banner.setPosition(view.width / 2, view.height / 2 - 40);
      this.#banner.setText(view.banner ?? '').setVisible(view.banner !== undefined);
    }
    this.#roundLabel?.setText(view.round === undefined ? '' : `Round ${view.round}`);
  }

  override update(time: number): void {
    for (const sprite of this.#boomerangs.values()) sprite.spin(time);
    this.#effects = this.#effects.filter((effect) => {
      const progress = (time - effect.born) / effect.duration;
      if (progress >= 1) {
        effect.graphics.destroy();
        return false;
      }
      effect.update(effect.graphics, progress);
      return true;
    });
  }

  drawn(): readonly DrawnCircle[] {
    return [...this.#sprites].map(([id, sprite]) => ({
      id,
      x: sprite.container.x,
      y: sprite.container.y,
    }));
  }

  drawnBoomerangs(): readonly DrawnCircle[] {
    return [...this.#boomerangs].map(([id, sprite]) => ({
      id,
      x: sprite.container.x,
      y: sprite.container.y,
    }));
  }

  /** Brief, primitive feedback: a ring (and for a hit, a flash) at the place something happened. */
  #spawnEffect(event: ViewEvent): void {
    const color = toNumber(event.color);
    const graphics = this.add.graphics().setDepth(5);
    const born = this.time.now;
    const ring =
      (radiusFrom: number, radiusTo: number, width: number) =>
      (g: Phaser.GameObjects.Graphics, progress: number) => {
        g.clear();
        g.lineStyle(width * (1 - progress) + 1, color, 1 - progress);
        g.strokeCircle(event.x, event.y, radiusFrom + (radiusTo - radiusFrom) * progress);
      };
    switch (event.type) {
      case 'THROWN':
        this.#effects.push({ graphics, born, duration: 260, update: ring(20, 62, 6) });
        break;
      case 'CAUGHT':
        this.#effects.push({ graphics, born, duration: 220, update: ring(60, 24, 6) });
        break;
      case 'HIT':
        this.#effects.push({
          graphics,
          born,
          duration: 520,
          update: (g, progress) => {
            g.clear();
            g.fillStyle(0xffffff, 0.8 * (1 - progress) ** 2);
            g.fillCircle(event.x, event.y, 36 + progress * 30);
            g.lineStyle(10 * (1 - progress) + 1, color, 1 - progress);
            g.strokeCircle(event.x, event.y, 40 + progress * 120);
          },
        });
        break;
      case 'ROUND_START':
        this.#effects.push({ graphics, born, duration: 650, update: ring(40, 520, 10) });
        break;
    }
  }
}

function drawBackdrop(scene: Phaser.Scene, width: number, height: number): void {
  const g = scene.add.graphics();
  g.fillStyle(0x121a24, 1);
  g.fillRect(0, 0, width, height);
  g.lineStyle(8, 0x3c4a5c, 1);
  g.strokeRect(4, 4, width - 8, height - 8);
}

/** Creates the Phaser game inside `container` and resolves once its scene is running. */
export function createPhaserArena(
  container: HTMLElement,
  width = 1600,
  height = 900,
): Promise<ArenaRenderer> {
  return new Promise((resolve, reject) => {
    let game: Phaser.Game | undefined;
    const scene = new ArenaScene(() => {
      drawBackdrop(scene, width, height);
      resolve({
        render: (view) => scene.show(view),
        drawn: () => scene.drawn(),
        drawnBoomerangs: () => scene.drawnBoomerangs(),
        destroy: () => game?.destroy(true),
      });
    });
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width,
        height,
        backgroundColor: '#0e1217',
        banner: false,
        audio: { noAudio: true },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene,
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Phaser failed to start'));
    }
  });
}
