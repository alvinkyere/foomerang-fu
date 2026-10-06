import * as Phaser from 'phaser';
import type { ArenaRenderer, DrawnCircle } from '../renderer';
import type { ArenaView, CircleView } from '../viewModel';

/**
 * THE Phaser module. It is the only file that imports Phaser (lint-enforced) and it is loaded
 * lazily, so a lobby never downloads it. It draws an ArenaView; it holds no simulation state, runs
 * no physics and never moves anything on its own: every position on screen was handed to it.
 */

const DIMMED_ALPHA = 0.35;
const OUTLINE = 0xffffff;

const toNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

class PlayerSprite {
  readonly container: Phaser.GameObjects.Container;
  readonly #shape: Phaser.GameObjects.Graphics;
  readonly #number: Phaser.GameObjects.Text;
  readonly #name: Phaser.GameObjects.Text;
  #styleKey = '';

  constructor(scene: Phaser.Scene) {
    this.#shape = scene.add.graphics();
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
    this.container = scene.add.container(0, 0, [this.#shape, this.#number, this.#name]);
  }

  apply(circle: CircleView): void {
    this.container.setPosition(circle.x, circle.y);
    this.container.setAlpha(circle.dimmed ? DIMMED_ALPHA : 1);

    const key = `${circle.shape}|${circle.color}|${circle.radius}|${circle.number}|${circle.label}`;
    if (key === this.#styleKey) return;
    this.#styleKey = key;
    this.#draw(circle);
    this.#number.setText(circle.number > 0 ? String(circle.number) : '');
    this.#name.setText(circle.label).setY(circle.radius + 6);
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

class ArenaScene extends Phaser.Scene {
  readonly #sprites = new Map<string, PlayerSprite>();
  #ready: (() => void) | undefined;

  constructor(ready: () => void) {
    super('arena');
    this.#ready = ready;
  }

  create(): void {
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
  }

  drawn(): readonly DrawnCircle[] {
    return [...this.#sprites].map(([id, sprite]) => ({
      id,
      x: sprite.container.x,
      y: sprite.container.y,
    }));
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
