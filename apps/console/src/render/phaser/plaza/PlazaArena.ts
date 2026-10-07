import * as Phaser from 'phaser';
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
import { PLAZA_CANVAS, plazaGroundScale, plazaProject } from '../../plaza/camera';
import { POWER_STYLE, toNumber } from '../effects';
import { Vfx, type VfxCamera } from '../garden/vfx';
import { headingFrame, plazaCharacterFor, type PlazaCharacter } from './plazaRoster';

/**
 * market_plaza's renderer: the map reconstructed from the master gameplay video (art/reconstruction). Everything visible is
 * BAKED from the reconstruction through the solved game camera (plaza/camera.ts): a ground layer with the cast shadows, every
 * tall object as its own layer depth-sorted by its footprint, and pack-character atlases (16 headings × standing/airborne).
 * The renderer only places them from the authoritative view: it never steps the simulation and never invents a position.
 * Assets are loaded at runtime from /maps/market_plaza/ (not bundled; outside the code-asset budgets).
 */
const ASSETS = `${import.meta.env.BASE_URL}maps/market_plaza/`;
const BOOMERANG_HEIGHT = 24;
const FADE_ALPHA = 0.45;
interface Manifest {
  readonly ground: string;
  readonly occluders: readonly {
    key: string;
    file: string;
    x: number;
    y: number;
    depth: number;
    fade?: boolean;
  }[];
  readonly characters: Readonly<
    Record<string, { file: string; cell: number; anchor: [number, number]; frames: number }>
  >;
}

const PLAZA_VFX_CAMERA: VfxCamera = { project: plazaProject, groundScale: plazaGroundScale };

class PlazaCharacterSprite {
  readonly sprite: Phaser.GameObjects.Image;
  readonly #shadow: Phaser.GameObjects.Ellipse;
  readonly #ring: Phaser.GameObjects.Ellipse;
  screen = { x: 0, y: 0 };
  #deadAt: number | undefined;
  #heading = 0;

  constructor(
    scene: Phaser.Scene,
    readonly kind: PlazaCharacter,
    cell: number,
    anchor: readonly [number, number],
  ) {
    this.#shadow = scene.add.ellipse(0, 0, 10, 6, 0x33402a, 0.32);
    this.#ring = scene.add.ellipse(0, 0, 10, 6).setStrokeStyle(3, 0xffffff, 0.85).setFillStyle();
    this.sprite = scene.add
      .image(0, 0, `plaza-${kind}`, 0)
      .setOrigin(anchor[0] / cell, anchor[1] / cell);
  }

  update(c: CircleView, now: number, speed: number): void {
    const g = plazaProject(c.x, c.y);
    const s = plazaGroundScale(c.x, c.y);
    this.screen = g;
    const f = c.dashing?.direction ?? c.facing;
    if (f !== undefined && Math.hypot(f.x, f.y) > 1e-6) this.#heading = headingFrame(f.x, f.y);
    const airborne = c.dashing !== undefined || c.dead;
    this.sprite.setFrame((airborne ? 16 : 0) + this.#heading);
    // movement bounce (the reference characters hop while they run); none while standing
    const hop = speed > 40 ? Math.abs(Math.sin(now / 75)) * 7 : 0;
    const squash = speed > 40 ? 1 - 0.06 * (1 - Math.abs(Math.sin(now / 75))) : 1;
    this.sprite.setPosition(g.x, g.y - hop).setScale(1 / squash, squash);
    const rx = c.radius * s.sx;
    const ry = c.radius * s.sy;
    this.#shadow.setPosition(g.x + 3, g.y + 2).setSize(rx * 1.7, ry * 1.1);
    this.#ring
      .setPosition(g.x, g.y)
      .setSize(rx * 2, ry * 2)
      .setStrokeStyle(3, toNumber(c.color), 0.85);
    if (c.dead) this.#deadAt ??= now;
    else this.#deadAt = undefined;
    const fade = this.#deadAt === undefined ? 1 : Math.max(0, 1 - (now - this.#deadAt) / 450);
    const a = (c.dimmed && !c.dead ? 0.5 : 1) * fade;
    this.sprite.setAlpha(a);
    this.#shadow.setAlpha(0.32 * a);
    this.#ring.setAlpha(c.dead ? 0 : a);
    this.sprite.setDepth(g.y + 0.2);
    this.#shadow.setDepth(g.y - 0.6);
    this.#ring.setDepth(g.y - 0.5);
  }

  destroy(): void {
    this.sprite.destroy();
    this.#shadow.destroy();
    this.#ring.destroy();
  }
}

/** The boomerang: the reference's brown crescent, spinning, with a pale streak behind it; the owner's colour on its rim. */
class PlazaBoomerang {
  readonly #body: Phaser.GameObjects.Graphics;
  readonly #shadow: Phaser.GameObjects.Ellipse;
  readonly #trail: Phaser.GameObjects.Graphics;
  readonly #history: { x: number; y: number }[] = [];
  logical = { x: 0, y: 0 };
  #spentAt: number | undefined;
  #spent = false;

  constructor(scene: Phaser.Scene, color: number) {
    this.#shadow = scene.add.ellipse(0, 0, 30, 16, 0x33402a, 0.28);
    this.#trail = scene.add.graphics();
    const g = scene.add.graphics();
    for (const [w, c] of [
      [15, color],
      [10, 0x5c3a24],
    ] as const) {
      g.lineStyle(w, c, 1);
      g.beginPath();
      g.arc(6, 0, 20, Math.PI * 0.62, Math.PI * 1.38);
      g.strokePath();
    }
    this.#body = g;
  }

  apply(view: BoomerangView): void {
    this.logical = { x: view.x, y: view.y };
    const p = plazaProject(view.x, view.y, BOOMERANG_HEIGHT);
    const ground = plazaProject(view.x, view.y);
    this.#spent = view.spent;
    this.#body.setPosition(p.x, p.y).setDepth(ground.y + 1);
    this.#shadow.setPosition(ground.x + 4, ground.y + 3).setDepth(ground.y + 0.5);
    if (!view.spent) {
      const last = this.#history.at(-1);
      if (last === undefined || last.x !== p.x || last.y !== p.y)
        this.#history.push({ x: p.x, y: p.y });
      if (this.#history.length > 8) this.#history.shift();
    }
    this.#trail.clear().setDepth(ground.y + 0.6);
    this.#history.forEach((pt, i) => {
      const t = (i + 1) / this.#history.length;
      this.#trail.fillStyle(0xfff6de, 0.4 * t);
      this.#trail.fillCircle(pt.x, pt.y, 3 + 7 * t);
    });
  }

  spin(time: number): void {
    if (!this.#spent) {
      this.#body.setRotation(time / 40).setScale(1, 0.8);
      return;
    }
    this.#spentAt ??= time;
    const a = Math.max(0, 1 - (time - this.#spentAt) / 320);
    this.#body.setAlpha(a);
    this.#trail.setAlpha(a * 0.5);
  }

  destroy(): void {
    this.#body.destroy();
    this.#shadow.destroy();
    this.#trail.destroy();
  }
}

/** A Powerup Book lying on the plaza (the game's pickup; the master video shows none on this map). */
class PlazaBook {
  readonly #g: Phaser.GameObjects.Graphics;
  readonly logical: { x: number; y: number };
  constructor(scene: Phaser.Scene, view: PickupView) {
    this.logical = { x: view.x, y: view.y };
    const ground = plazaProject(view.x, view.y);
    const at = plazaProject(view.x, view.y, 16);
    const g = scene.add.graphics();
    g.fillStyle(0x33402a, 0.28).fillEllipse(ground.x + 3, ground.y + 2, 46, 24);
    g.fillStyle(0x2a6fdb, 1).fillRoundedRect(at.x - 18, at.y - 26, 36, 42, 5);
    g.lineStyle(3, 0xffffff, 1).strokeRoundedRect(at.x - 18, at.y - 26, 36, 42, 5);
    g.fillStyle(0xe5302f, 1).fillRect(at.x + 2, at.y + 10, 6, 12);
    this.#g = g.setDepth(ground.y);
  }
  destroy(): void {
    this.#g.destroy();
  }
}

class PlazaScene extends Phaser.Scene {
  readonly #sprites = new Map<string, PlazaCharacterSprite>();
  readonly #previous = new Map<string, { x: number; y: number; t: number }>();
  readonly #boomerangs = new Map<string, PlazaBoomerang>();
  readonly #books = new Map<number, PlazaBook>();
  readonly #occluders: {
    image: Phaser.GameObjects.Image;
    depth: number;
    alpha: number;
    fade: boolean;
  }[] = [];
  #manifest: Manifest | undefined;
  #vfx: Vfx | undefined;
  #banner: Phaser.GameObjects.Text | undefined;
  #ready: (() => void) | undefined;
  #view: ArenaView | undefined;
  #circles: DrawnCircle[] = [];

  constructor(ready: () => void) {
    super('market_plaza');
    this.#ready = ready;
  }

  preload(): void {
    this.load.json('plaza-manifest', `${ASSETS}manifest.json`);
    this.load.once(
      `filecomplete-json-plaza-manifest`,
      (_key: string, _type: string, data: Manifest) => {
        this.load.image('plaza-ground', `${ASSETS}${data.ground}`);
        for (const o of data.occluders) this.load.image(`plaza-occ-${o.key}`, `${ASSETS}${o.file}`);
        for (const [name, c] of Object.entries(data.characters))
          this.load.spritesheet(`plaza-${name}`, `${ASSETS}${c.file}`, {
            frameWidth: c.cell,
            frameHeight: c.cell,
          });
      },
    );
  }

  create(): void {
    const m = this.cache.json.get('plaza-manifest') as Manifest;
    this.#manifest = m;
    this.add.image(0, 0, 'plaza-ground').setOrigin(0, 0).setDepth(-1e6);
    for (const o of m.occluders) {
      const image = this.add
        .image(o.x, o.y, `plaza-occ-${o.key}`)
        .setOrigin(0, 0)
        .setDepth(o.depth);
      this.#occluders.push({ image, depth: o.depth, alpha: 1, fade: o.fade === true });
    }
    this.#vfx = new Vfx(
      this,
      (id) => {
        const circle = this.#view?.circles.find((q) => q.id === id);
        return circle === undefined ? undefined : plazaCharacterFor(circle.number).toUpperCase();
      },
      PLAZA_VFX_CAMERA,
    );
    this.#banner = this.add
      .text(PLAZA_CANVAS.width / 2, 64, '', {
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
    if (this.sys === undefined || !this.sys.isActive() || this.#manifest === undefined) return;
    this.#view = view;
    const now = this.time.now;
    const present = new Set<string>();
    this.#circles = [];
    for (const c of view.circles) {
      present.add(c.id);
      let sprite = this.#sprites.get(c.id);
      if (sprite === undefined) {
        const kind = plazaCharacterFor(c.number);
        const meta = this.#manifest.characters[kind];
        if (meta === undefined) continue;
        sprite = new PlazaCharacterSprite(this, kind, meta.cell, meta.anchor);
        this.#sprites.set(c.id, sprite);
      }
      const prev = this.#previous.get(c.id);
      const speed =
        prev !== undefined && now > prev.t
          ? (Math.hypot(c.x - prev.x, c.y - prev.y) / (now - prev.t)) * 1000
          : 0;
      this.#previous.set(c.id, { x: c.x, y: c.y, t: now });
      sprite.update(c, now, speed);
      this.#circles.push({ id: c.id, x: c.x, y: c.y });
    }
    for (const [id, sprite] of this.#sprites)
      if (!present.has(id)) {
        sprite.destroy();
        this.#sprites.delete(id);
        this.#previous.delete(id);
      }
    const flying = new Set<string>();
    for (const b of view.boomerangs) {
      flying.add(b.id);
      let art = this.#boomerangs.get(b.id);
      if (art === undefined) {
        art = new PlazaBoomerang(this, toNumber(b.color));
        this.#boomerangs.set(b.id, art);
      }
      art.apply(b);
    }
    for (const [id, art] of this.#boomerangs)
      if (!flying.has(id)) {
        art.destroy();
        this.#boomerangs.delete(id);
      }
    const lying = new Set<number>();
    for (const p of view.pickups) {
      lying.add(p.id);
      if (!this.#books.has(p.id)) this.#books.set(p.id, new PlazaBook(this, p));
    }
    for (const [id, book] of this.#books)
      if (!lying.has(id)) {
        book.destroy();
        this.#books.delete(id);
      }
    for (const event of view.events) this.#event(event);
    this.#fadeWhatHidesSomeone();
    this.#banner?.setText(view.banner ?? '').setVisible(view.banner !== undefined);
  }

  #event(event: ViewEvent): void {
    this.#vfx?.event(event, POWER_STYLE.BLAST_BOOMERANG.color);
  }

  /** A tall object in front of a living player that overlaps their silhouette fades, so nobody is hidden (as in Garden). */
  #fadeWhatHidesSomeone(): void {
    const people = [...this.#sprites]
      .filter(([id]) => this.#view?.circles.find((q) => q.id === id)?.dead === false)
      .map(([, s]) => s);
    for (const o of this.#occluders) {
      if (!o.fade) continue;
      const b = o.image.getBounds();
      const hides = people.some(
        (s) => s.screen.y < o.depth && Phaser.Geom.Rectangle.Overlaps(b, s.sprite.getBounds()),
      );
      const target = hides ? FADE_ALPHA : 1;
      o.alpha += (target - o.alpha) * 0.3;
      o.image.setAlpha(o.alpha);
    }
  }

  override update(time: number): void {
    for (const b of this.#boomerangs.values()) b.spin(time);
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

/** Creates the Phaser game for market_plaza inside `container` and resolves once its scene is running. */
export function createPlazaArena(container: HTMLElement): Promise<ArenaRenderer> {
  return new Promise((resolve, reject) => {
    let game: Phaser.Game | undefined;
    const scene = new PlazaScene(() => {
      resolve({
        render: (view) => scene.show(view),
        drawn: () => scene.drawn(),
        drawnBoomerangs: () => scene.drawnBoomerangs(),
        drawnPickups: () => scene.drawnPickups(),
        drawnWalls: () => scene.drawnWalls(),
        drawnSystems: () => scene.drawnSystems(),
        driveClock: () => {
          game?.loop.stop();
          let last = 0;
          return (virtualMs: number) => {
            game?.step(virtualMs, Math.max(0, virtualMs - last));
            last = virtualMs;
          };
        },
        destroy: () => game?.destroy(true),
      });
    });
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: PLAZA_CANVAS.width,
        height: PLAZA_CANVAS.height,
        backgroundColor: '#efe6c4',
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
