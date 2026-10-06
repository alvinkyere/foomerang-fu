import * as Phaser from 'phaser';
import { GARDEN_HEIGHT, GARDEN_WIDTH, type PowerKind } from '@foomerang/foomerang-fu';
import type { ArenaRenderer, DrawnCircle } from '../../renderer';
import type {
  ArenaView,
  BoomerangView,
  CircleView,
  PickupView,
  SystemsViewModel,
  ViewEvent,
  WallView,
} from '../../viewModel';
import { CANVAS_HEIGHT, CANVAS_WIDTH, groundScale, project } from '../../garden/camera';
import { hidingSolids } from '../../garden/occlusion';
import { POWER_STYLE, toNumber } from '../effects';
import { Vfx } from './vfx';
import { bakeCharacters } from './charArt';
import { characterForNumber } from './characterKinds';
import { CharacterSprite } from './characters';
import { buildEnvironment, type Environment } from './environment';

/**
 * Garden's renderer. It draws an ArenaView through a camera fitted to the reference image; it holds no simulation state and
 * decides nothing (collision is the rules'; what is solid was handed over as the arena's walls and drawn from the same data).
 * Everything that animates — characters, portals, boomerang spin, effects — is presentation, timed by Phaser's clock.
 */

const FADE_ALPHA = 0.45;
const BOOMERANG_HEIGHT = 24;
const BOOK_HEIGHT = 16;

class BoomerangArt {
  readonly container: Phaser.GameObjects.Container;
  readonly #body: Phaser.GameObjects.Graphics;
  readonly #trail: Phaser.GameObjects.Graphics;
  readonly #shadow: Phaser.GameObjects.Graphics;
  readonly #history: { x: number; y: number }[] = [];
  #key = '';
  #spent: number | undefined;
  #pendingSpent = false;
  #color = 0xffffff;
  #deflected = false;
  logical = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.#shadow = scene.add.graphics();
    this.#trail = scene.add.graphics();
    this.#body = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.#body]);
  }

  apply(view: BoomerangView): void {
    this.logical = { x: view.x, y: view.y };
    const p = project(view.x, view.y, BOOMERANG_HEIGHT);
    const ground = project(view.x, view.y);
    const s = groundScale(view.x, view.y);
    this.#pendingSpent = view.spent;
    this.#deflected = view.state === 'DEFLECTED';
    this.#color = toNumber(view.color);
    this.container.setPosition(p.x, p.y);
    this.#shadow.clear();
    this.#shadow.fillStyle(0x1b3a1b, 0.3);
    this.#shadow.fillEllipse(ground.x + 4, ground.y + 3, 34 * s.sx, 20 * s.sy);
    const key = `${view.color}|${view.blast}`;
    if (key !== this.#key) {
      this.#key = key;
      const g = this.#body;
      g.clear();
      if (view.blast) {
        g.lineStyle(6, POWER_STYLE.BLAST_BOOMERANG.color, 1);
        g.strokeCircle(0, 0, 30);
      }
      for (const [w, c] of [
        [20, 0xffffff],
        [13, this.#color],
      ] as const) {
        g.lineStyle(w, c, 1);
        g.lineBetween(-22, -26, 4, 0);
        g.lineBetween(4, 0, -22, 26);
      }
    }
    if (!view.spent) {
      this.#spent = undefined;
      this.container.setAlpha(1);
      const last = this.#history.at(-1);
      if (last === undefined || last.x !== p.x || last.y !== p.y) {
        this.#history.push({ x: p.x, y: p.y });
        if (this.#history.length > 9) this.#history.shift();
      }
    }
    this.#drawTrail();
    this.container.setDepth(ground.y + 1);
    this.#shadow.setDepth(ground.y + 0.5);
    this.#trail.setDepth(ground.y + 0.6);
  }

  #drawTrail(): void {
    const g = this.#trail;
    g.clear();
    const n = this.#history.length;
    this.#history.forEach((pt, i) => {
      const t = (i + 1) / n;
      g.fillStyle(this.#deflected ? 0xffffff : this.#color, 0.45 * t);
      g.fillCircle(pt.x, pt.y, 4 + 9 * t);
    });
  }

  spin(time: number): void {
    if (!this.#pendingSpent) {
      this.container.setRotation(time / 55);
      this.container.setScale(1, 0.82);
      return;
    }
    this.#spent ??= time;
    const alpha = Math.max(0, 1 - (time - this.#spent) / 320);
    this.container.setAlpha(alpha);
    this.#trail.setAlpha(alpha * 0.5);
  }

  destroy(): void {
    this.#shadow.destroy();
    this.#trail.destroy();
    this.container.destroy();
  }
}

/** A Powerup Book lying in the garden: the same blue book with a red bookmark for every power, and a question mark. */
class BookArt {
  readonly container: Phaser.GameObjects.Container;
  readonly #shadow: Phaser.GameObjects.Graphics;
  readonly logical: { x: number; y: number };

  constructor(scene: Phaser.Scene, view: PickupView) {
    this.logical = { x: view.x, y: view.y };
    const ground = project(view.x, view.y);
    const s = groundScale(view.x, view.y);
    this.#shadow = scene.add.graphics();
    this.#shadow.fillStyle(0x1b3a1b, 0.3);
    this.#shadow.fillEllipse(ground.x + 3, ground.y + 2, 54 * s.sx, 30 * s.sy);
    this.#shadow.setDepth(ground.y - 0.5);
    const book = scene.add.graphics();
    book.fillStyle(0x1b4aa0, 1);
    book.fillRoundedRect(-22, -30, 44, 52, 6);
    book.fillStyle(0x2a6fdb, 1);
    book.fillRoundedRect(-20, -33, 42, 52, 6);
    book.fillStyle(0x1b4aa0, 1);
    book.fillRect(-20, -33, 7, 52);
    book.fillStyle(0xf4f1e6, 1);
    book.fillRect(17, -29, 4, 45);
    book.lineStyle(3, 0xffffff, 1);
    book.strokeRoundedRect(-20, -33, 42, 52, 6);
    book.fillStyle(0xe5302f, 1);
    book.fillRect(2, 14, 8, 18);
    book.fillTriangle(2, 32, 10, 32, 6, 25);
    const mark = scene.add
      .text(1, -8, '?', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#0c1118',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const at = project(view.x, view.y, BOOK_HEIGHT);
    this.container = scene.add.container(at.x, at.y, [book, mark]).setDepth(ground.y);
  }

  bob(time: number): void {
    this.container.setScale(1 + 0.07 * Math.sin(time / 220));
  }

  destroy(): void {
    this.#shadow.destroy();
    this.container.destroy();
  }
}

class GardenScene extends Phaser.Scene {
  readonly #sprites = new Map<string, CharacterSprite>();
  readonly #previous = new Map<string, { x: number; y: number; t: number }>();
  readonly #boomerangs = new Map<string, BoomerangArt>();
  readonly #books = new Map<number, BookArt>();
  #env: Environment | undefined;
  #chars: ReturnType<typeof bakeCharacters> | undefined;
  #vfx: Vfx | undefined;
  #banner: Phaser.GameObjects.Text | undefined;
  #ready: (() => void) | undefined;
  #view: ArenaView | undefined;
  #circles: DrawnCircle[] = [];

  constructor(ready: () => void) {
    super('garden');
    this.#ready = ready;
  }

  create(): void {
    this.#env = buildEnvironment(this);
    this.#chars = bakeCharacters(this);
    this.#vfx = new Vfx(this, (id) => {
      const circle = this.#view?.circles.find((q) => q.id === id);
      return circle === undefined ? undefined : characterForNumber(circle.number);
    });
    this.#banner = this.add
      .text(CANVAS_WIDTH / 2, 64, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '54px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2a2f55',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(9000)
      .setVisible(false);
    this.#ready?.();
    this.#ready = undefined;
  }

  show(view: ArenaView): void {
    if (this.sys === undefined || !this.sys.isActive()) return;
    this.#view = view;
    const now = this.time.now;
    const champion = view.hud?.phase === 'MATCH_OVER' ? view.hud.champion?.id : undefined;

    const present = new Set<string>();
    this.#circles = [];
    for (const circle of view.circles) {
      present.add(circle.id);
      let sprite = this.#sprites.get(circle.id);
      if (sprite === undefined) {
        sprite = new CharacterSprite(
          this,
          this.#baked().art[characterForNumber(circle.number)],
          this.#baked().shadow,
        );
        this.#sprites.set(circle.id, sprite);
      }
      this.#placeCharacter(sprite, circle, now, champion === circle.id);
      this.#circles.push({ id: circle.id, x: circle.x, y: circle.y });
    }
    for (const [id, sprite] of this.#sprites) {
      if (!present.has(id)) {
        sprite.destroy();
        this.#sprites.delete(id);
        this.#previous.delete(id);
      }
    }

    const flying = new Set<string>();
    for (const b of view.boomerangs) {
      flying.add(b.id);
      let art = this.#boomerangs.get(b.id);
      if (art === undefined) {
        art = new BoomerangArt(this);
        this.#boomerangs.set(b.id, art);
      }
      art.apply(b);
    }
    for (const [id, art] of this.#boomerangs) {
      if (!flying.has(id)) {
        art.destroy();
        this.#boomerangs.delete(id);
      }
    }

    const lying = new Set<number>();
    for (const p of view.pickups) {
      lying.add(p.id);
      if (!this.#books.has(p.id)) this.#books.set(p.id, new BookArt(this, p));
    }
    for (const [id, book] of this.#books) {
      if (!lying.has(id)) {
        book.destroy();
        this.#books.delete(id);
      }
    }

    for (const event of view.events) this.#event(event, now);
    this.#fadeWhatHidesSomeone();
    this.#banner?.setText(view.banner ?? '').setVisible(view.banner !== undefined);
  }

  #baked(): ReturnType<typeof bakeCharacters> {
    if (this.#chars === undefined) throw new Error('the characters have not been painted yet');
    return this.#chars;
  }

  #placeCharacter(sprite: CharacterSprite, c: CircleView, now: number, victorious: boolean): void {
    const p = project(c.x, c.y);
    const s = groundScale(c.x, c.y);
    const prev = this.#previous.get(c.id);
    let speed = 0;
    let heading = { x: 0, y: 0 };
    if (prev !== undefined && now > prev.t) {
      speed = (Math.hypot(c.x - prev.x, c.y - prev.y) / (now - prev.t)) * 1000;
      const before = project(prev.x, prev.y);
      const d = Math.hypot(p.x - before.x, p.y - before.y);
      if (d > 0.01) heading = { x: (p.x - before.x) / d, y: (p.y - before.y) / d };
    }
    this.#previous.set(c.id, { x: c.x, y: c.y, t: now });
    sprite.update(
      {
        x: p.x,
        y: p.y,
        k: s.sx,
        ringRx: c.radius * s.sx,
        ringRy: c.radius * s.sy,
        facing: c.facing ?? { x: 0, y: 1 },
        speed,
        heading,
        dead: c.dead,
        armed: c.armed,
        dashing: c.dashing !== undefined,
        fatigued: c.fatigued === true,
        phasing: c.phasing === undefined ? 'none' : c.phasing.inWall ? 'wall' : 'open',
        dimmed: c.dimmed,
        victorious,
        color: toNumber(c.color),
        label: c.label,
        number: c.number,
        powers: c.powers as readonly PowerKind[],
      },
      now,
    );
    sprite.container.setDepth(p.y + 0.2);
  }

  #event(event: ViewEvent, now: number): void {
    if (event.type === 'THROWN' && event.actor !== undefined)
      this.#sprites.get(event.actor)?.act('THROW', now);
    if (event.type === 'SLASHED' && event.actor !== undefined)
      this.#sprites.get(event.actor)?.act('SLASH', now);
    this.#vfx?.event(event, POWER_STYLE.BLAST_BOOMERANG.color);
  }

  /**
   * THE OCCLUSION RULE. A wall or rock that is in front of a living player and overlaps their silhouette on screen fades to
   * 40% (smoothly) while it does; nothing else is ever transparent. So the garden keeps its solid, chunky look, and nobody
   * disappears behind cover without being seen.
   */
  #fadeWhatHidesSomeone(): void {
    const solids = this.#env?.solids ?? [];
    const people = [...this.#sprites]
      .filter(([id]) => this.#view?.circles.find((q) => q.id === id)?.dead === false)
      .map(([, sprite]) => ({ depth: sprite.screen.y, box: sprite.box }));
    const hiding = hidingSolids(solids, people);
    solids.forEach((w, i) => {
      const target = hiding[i] === true ? FADE_ALPHA : 1;
      w.alpha += (target - w.alpha) * 0.3;
      if (Math.abs(w.alpha - target) < 0.01) w.alpha = target;
      w.image.setAlpha(w.alpha);
    });
  }

  /** Walls (and rocks) currently faded because they hide someone: for tests and the visual gate. */
  fadedSolids(): number {
    return (this.#env?.solids ?? []).filter((w) => w.alpha < 0.99).length;
  }

  override update(time: number): void {
    this.#env?.update(time);
    for (const b of this.#boomerangs.values()) b.spin(time);
    for (const b of this.#books.values()) b.bob(time);
    this.#vfx?.update(time);
  }

  drawn(): readonly DrawnCircle[] {
    return this.#circles;
  }

  drawnBoomerangs(): readonly DrawnCircle[] {
    return [...this.#boomerangs].map(([id, b]) => ({ id, ...b.logical }));
  }

  drawnPickups(): readonly DrawnCircle[] {
    return [...this.#books].map(([id, b]) => ({ id: String(id), ...b.logical }));
  }

  drawnWalls(): readonly WallView[] {
    return this.#view?.walls ?? [];
  }

  drawnSystems(): SystemsViewModel | undefined {
    return this.#view?.systems;
  }
}

/** Creates the Phaser game for Garden inside `container` and resolves once its scene is running. */
export function createGardenArena(container: HTMLElement): Promise<ArenaRenderer> {
  return new Promise((resolve, reject) => {
    let game: Phaser.Game | undefined;
    const scene = new GardenScene(() => {
      resolve({
        render: (view) => scene.show(view),
        drawn: () => scene.drawn(),
        drawnBoomerangs: () => scene.drawnBoomerangs(),
        drawnPickups: () => scene.drawnPickups(),
        drawnWalls: () => scene.drawnWalls(),
        drawnSystems: () => scene.drawnSystems(),
        driveClock: () => {
          game?.loop.stop(); // the browser's animation frame no longer drives Phaser: whoever calls the returned function does
          let last = 0;
          return (virtualMs: number) => {
            game?.step(virtualMs, Math.max(0, virtualMs - last));
            last = virtualMs;
          };
        },
        destroy: () => game?.destroy(true),
      });
    });
    void GARDEN_WIDTH;
    void GARDEN_HEIGHT;
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: '#78a96c',
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
