import * as Phaser from 'phaser';
import { POWER_STYLE, toNumber } from './effects';

/** A map's projection: world (x, y, height) → canvas pixels, and the ground scale there. */
export interface VfxCamera {
  project(x: number, y: number, z?: number): { readonly x: number; readonly y: number };
  groundScale(x: number, y: number): { readonly sx: number; readonly sy: number };
}
import type { ViewEvent } from '../viewModel';
import { makeCanvas, polyPath, rng, roundedPath, type P } from './paint';

/** The direction the maps' light comes from (shadows fall away from it), in world units per unit of height. */
const LIGHT = { x: 0.95, y: 1.0 } as const;

/**
 * The maps' effects, in the reference video's language: flat, shape-driven, saturated shapes with soft opacity — a hot disc,
 * a shock ring, chunky dark debris, sparks, soft dust puffs, a burst of the victim's own colours — never photoreal smoke.
 * They follow the rules' events (positions, the exact blast radius, the exact swing arc and reach); they never decide
 * anything, and they are short, so the floor is left clean.
 */

const DEPTH = 5000;

function bakeTextures(scene: Phaser.Scene): void {
  const add = (key: string, canvas: HTMLCanvasElement): void => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);
  };
  const radial = (size: number, stops: [number, string][]): HTMLCanvasElement => {
    const { canvas, ctx } = makeCanvas(size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, c] of stops) g.addColorStop(at, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  };
  add(
    'fx-glow',
    radial(96, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,255,255,0.55)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  add(
    'fx-puff',
    (() => {
      const { canvas, ctx } = makeCanvas(96, 96);
      const r = rng(5);
      for (let i = 0; i < 7; i += 1) {
        const x = 48 + (r() - 0.5) * 30;
        const y = 48 + (r() - 0.5) * 24;
        const rr = 20 + r() * 14;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, 'rgba(255,255,255,0.8)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 96, 96);
      }
      return canvas;
    })(),
  );
  add(
    'fx-chunk',
    (() => {
      const { canvas, ctx } = makeCanvas(48, 48);
      const pts: P[] = [
        { x: 8, y: 14 },
        { x: 22, y: 5 },
        { x: 40, y: 12 },
        { x: 42, y: 32 },
        { x: 26, y: 43 },
        { x: 9, y: 34 },
      ];
      roundedPath(ctx, pts, 0.35);
      const g = ctx.createLinearGradient(8, 5, 40, 43);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(150,150,170,1)');
      ctx.fillStyle = g;
      ctx.fill();
      return canvas;
    })(),
  );
  add(
    'fx-spark',
    (() => {
      const { canvas, ctx } = makeCanvas(48, 16);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      polyPath(ctx, [
        { x: 0, y: 8 },
        { x: 14, y: 2 },
        { x: 48, y: 8 },
        { x: 14, y: 14 },
      ]);
      ctx.fill();
      return canvas;
    })(),
  );
  add(
    'fx-star',
    (() => {
      const { canvas, ctx } = makeCanvas(128, 128);
      ctx.translate(64, 64);
      const pts: P[] = [];
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 === 0 ? 62 : 22;
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      polyPath(ctx, pts);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 62);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,248,200,1)');
      g.addColorStop(1, 'rgba(255,214,90,0.95)');
      ctx.fillStyle = g;
      ctx.fill();
      return canvas;
    })(),
  );
  add(
    'fx-disc',
    radial(192, [
      [0, 'rgba(255,255,230,1)'],
      [0.45, 'rgba(255,226,70,1)'],
      [0.8, 'rgba(255,150,40,1)'],
      [0.93, 'rgba(240,80,40,0.95)'],
      [1, 'rgba(240,80,40,0)'],
    ]),
  );
  add(
    'fx-ring',
    (() => {
      const { canvas, ctx } = makeCanvas(192, 192);
      const g = ctx.createRadialGradient(96, 96, 70, 96, 96, 94);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.6, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 192, 192);
      return canvas;
    })(),
  );
  add(
    'fx-boomerang',
    (() => {
      const { canvas, ctx } = makeCanvas(96, 96);
      ctx.translate(48, 48);
      const arm = (sign: number): void => {
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.quadraticCurveTo(-16, sign * 14, -34, sign * 30);
        ctx.lineTo(-24, sign * 36);
        ctx.quadraticCurveTo(-6, sign * 22, 8, sign * 4);
        ctx.closePath();
      };
      for (const [w, c] of [[6, 'rgba(255,255,255,1)']] as const) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        arm(-1);
        ctx.stroke();
        arm(1);
        ctx.stroke();
      }
      const g = ctx.createLinearGradient(-30, -30, 20, 30);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(190,190,205,1)');
      ctx.fillStyle = g;
      arm(-1);
      ctx.fill();
      arm(1);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(-2, -3, 7, 4, -0.4, 0, Math.PI * 2);
      ctx.fill();
      return canvas;
    })(),
  );
}

interface Item {
  readonly born: number;
  readonly duration: number;
  readonly update: (progress: number, now: number) => void;
  readonly done: () => void;
}

interface Particle {
  readonly img: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image | undefined;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  readonly gravity: number;
  rot: number;
  readonly vr: number;
  readonly s0: number;
  readonly s1: number;
  readonly a0: number;
  readonly born: number;
  readonly life: number;
  readonly stretch: boolean;
}

/** The colours a character bursts into when it is struck down (its own pieces, as in the video's death). */
const PIECES: Readonly<Record<string, readonly number[]>> = {
  BREAD: [0xf7dca4, 0xeec47a, 0xc98f48],
  COFFEE: [0xf4f5fa, 0xdadeee, 0x6b3b22, 0x40220f],
  PUMPKIN: [0xf08a24, 0xffb85c, 0x5f8c3a],
  FRUIT: [0xa9dc7d, 0xdaf3b9, 0x7a5a3a, 0x6cb843],
};

export class Vfx {
  readonly #scene: Phaser.Scene;
  readonly #items: Item[] = [];
  readonly #particles: Particle[] = [];
  readonly #kindOf: (id: string | undefined) => string | undefined;
  #seed = 1;

  /** The projection of the arena this effect layer draws in (each map supplies its own). */
  readonly #cam: VfxCamera;

  constructor(
    scene: Phaser.Scene,
    kindOf: (id: string | undefined) => string | undefined,
    cam: VfxCamera,
  ) {
    this.#cam = cam;
    this.#scene = scene;
    this.#kindOf = kindOf;
    bakeTextures(scene);
  }

  #rand(): number {
    this.#seed = (Math.imul(this.#seed, 1103515245) + 12345) >>> 0;
    return (this.#seed >>> 8) / 16777216;
  }

  /** A particle that lives on the ground plane (x, y) at a height z, with a soft shadow on the floor. */
  #particle(
    key: string,
    x: number,
    y: number,
    z: number,
    opts: {
      vx?: number;
      vy?: number;
      vz?: number;
      gravity?: number;
      tint?: number;
      s0: number;
      s1: number;
      a0?: number;
      life: number;
      spin?: number;
      add?: boolean;
      shadow?: boolean;
      stretch?: boolean;
      depth?: number;
    },
  ): void {
    const img = this.#scene.add.image(0, 0, key).setDepth(opts.depth ?? DEPTH);
    if (opts.tint !== undefined) img.setTint(opts.tint);
    if (opts.add === true) img.setBlendMode(Phaser.BlendModes.ADD);
    const shadow =
      opts.shadow === true
        ? this.#scene.add
            .image(0, 0, 'char-shadow')
            .setDepth(DEPTH - 1)
            .setAlpha(0.4)
        : undefined;
    this.#particles.push({
      img,
      shadow,
      x,
      y,
      z,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      vz: opts.vz ?? 0,
      gravity: opts.gravity ?? 0,
      rot: this.#rand() * Math.PI * 2,
      vr: (opts.spin ?? 0) * (this.#rand() - 0.5) * 2,
      s0: opts.s0,
      s1: opts.s1,
      a0: opts.a0 ?? 1,
      born: this.#scene.time.now,
      life: opts.life,
      stretch: opts.stretch === true,
    });
  }

  /** A soft puff of dust on the ground. */
  #dust(x: number, y: number, n: number, spread: number, tint = 0xf6f0d6): void {
    for (let i = 0; i < n; i += 1) {
      const a = this.#rand() * Math.PI * 2;
      this.#particle('fx-puff', x, y, 4, {
        vx: Math.cos(a) * spread * (0.4 + this.#rand()),
        vy: Math.sin(a) * spread * (0.4 + this.#rand()) * 0.8,
        vz: 18 + this.#rand() * 20,
        tint,
        s0: 0.3 + this.#rand() * 0.2,
        s1: 0.8 + this.#rand() * 0.5,
        a0: 0.55,
        life: 480 + this.#rand() * 260,
      });
    }
  }

  #sparks(
    x: number,
    y: number,
    n: number,
    speed: number,
    tint: number,
    dir?: { x: number; y: number },
    cone = Math.PI * 2,
  ): void {
    const base = dir === undefined ? 0 : Math.atan2(dir.y, dir.x);
    for (let i = 0; i < n; i += 1) {
      const a = dir === undefined ? this.#rand() * Math.PI * 2 : base + (this.#rand() - 0.5) * cone;
      const v = speed * (0.5 + this.#rand() * 0.7);
      this.#particle('fx-spark', x, y, 22, {
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: 80 + this.#rand() * 120,
        gravity: 700,
        tint,
        s0: 0.55 + this.#rand() * 0.4,
        s1: 0.15,
        a0: 1,
        life: 380 + this.#rand() * 260,
        stretch: true,
        add: true,
      });
    }
  }

  #item(duration: number, update: Item['update'], created: Phaser.GameObjects.GameObject[]): void {
    this.#items.push({
      born: this.#scene.time.now,
      duration,
      update,
      done: () => created.forEach((o) => o.destroy()),
    });
  }

  /** Spawns whatever a view event looks like. */
  event(event: ViewEvent, blastColor: number): void {
    const color = toNumber(event.color);
    const { x, y } = event;
    switch (event.type) {
      case 'THROWN': {
        this.#dust(x, y, 3, 55);
        const d = event.direction ?? { x: 1, y: 0 };
        this.#sparks(x + d.x * 40, y + d.y * 40, 4, 260, color, d, 0.8);
        break;
      }
      case 'CAUGHT':
        this.#burst(x, y, color, 8);
        break;
      case 'HIT':
        this.#impact(x, y, color, event.actor);
        break;
      case 'DEFLECTED':
        this.#clank(x, y, color, event.knock ?? { x: 1, y: 0 });
        break;
      case 'DASHED': {
        const d = event.direction ?? { x: 1, y: 0 };
        const tint = event.phasing === true ? POWER_STYLE.PHASE_DASH.color : color;
        this.#dust(x, y, 4, 70, event.phasing === true ? 0xd8c8ff : 0xf6f0d6);
        for (let i = 0; i < 7; i += 1) {
          const o = (this.#rand() - 0.5) * 50;
          this.#particle('fx-spark', x - d.x * 10 - d.y * o, y - d.y * 10 + d.x * o, 22, {
            vx: -d.x * 340,
            vy: -d.y * 340,
            tint,
            s0: 0.9,
            s1: 0.2,
            a0: 0.9,
            life: 300,
            stretch: true,
            add: true,
          });
        }
        break;
      }
      case 'SLASHED':
        if (event.swing !== undefined) this.#slash(event, event.swing, color);
        break;
      case 'BLASTED':
        this.#blast(x, y, event.radius ?? 170, blastColor);
        break;
      case 'GUARD_BLOCKED': {
        const c = POWER_STYLE.GUARD.color;
        this.#ring(x, y, 40, 140, 380, c, 0.9);
        for (let i = 0; i < 9; i += 1) {
          const a = (i / 9) * Math.PI * 2 + 0.3;
          this.#particle('fx-chunk', x, y, 34, {
            vx: Math.cos(a) * 230,
            vy: Math.sin(a) * 230 * 0.8,
            vz: 130,
            gravity: 650,
            tint: c,
            s0: 0.5,
            s1: 0.2,
            life: 620,
            spin: 8,
            shadow: true,
          });
        }
        break;
      }
      case 'PHASE_ENTERED':
      case 'PHASE_EXITED':
        this.#ring(
          x,
          y,
          event.type === 'PHASE_ENTERED' ? 90 : 30,
          event.type === 'PHASE_ENTERED' ? 30 : 100,
          420,
          POWER_STYLE.PHASE_DASH.color,
          0.9,
        );
        this.#sparks(x, y, 8, 160, POWER_STYLE.PHASE_DASH.color);
        break;
      case 'FATIGUED':
        this.#ring(x, y, 110, 40, 480, 0xffb020, 0.8);
        break;
      case 'RECOVERED':
        this.#ring(x, y, 30, 100, 520, 0x7dff9b, 0.8);
        this.#sparks(x, y, 7, 150, 0x9dffb0);
        break;
      case 'SPAWNED':
        this.#ring(x, y, 70, 20, 520, 0xffffff, 0.8);
        this.#sparks(x, y, 8, 120, 0xfff2a8);
        break;
      case 'PICKUP': {
        const power = POWER_STYLE[event.kind ?? 'GUARD'].color;
        this.#burst(x, y, power, 14);
        this.#ring(x, y, 40, 130, 480, power, 0.9);
        break;
      }
      case 'POWER_LOST':
        this.#sparks(
          x,
          y,
          8,
          170,
          event.reason === 'SHIELD_BROKEN' ? POWER_STYLE.GUARD.color : 0xff6a5a,
        );
        break;
      case 'ROUND_START':
        this.#ring(x, y, 60, 520, 800, 0xffffff, 0.22);
        break;
      default:
        break;
    }
  }

  /** A thin expanding ring on the ground. */
  #ring(
    x: number,
    y: number,
    r0: number,
    r1: number,
    ms: number,
    tint: number,
    alpha: number,
  ): void {
    const img = this.#scene.add
      .image(0, 0, 'fx-ring')
      .setDepth(DEPTH - 2)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.#item(
      ms,
      (p) => {
        const r = r0 + (r1 - r0) * (1 - (1 - p) ** 2);
        const pt = this.#cam.project(x, y);
        const s = this.#cam.groundScale(x, y);
        img
          .setPosition(pt.x, pt.y)
          .setDisplaySize(r * 2 * s.sx, r * 2 * s.sy)
          .setAlpha(alpha * (1 - p));
      },
      [img],
    );
  }

  /** A pop of little coloured specks with a flash. */
  #burst(x: number, y: number, tint: number, n: number): void {
    const flash = this.#scene.add
      .image(0, 0, 'fx-star')
      .setDepth(DEPTH)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.#item(
      260,
      (p) => {
        const pt = this.#cam.project(x, y, 30);
        flash
          .setPosition(pt.x, pt.y)
          .setScale(0.3 + p * 0.5)
          .setAlpha(1 - p)
          .setRotation(p * 0.8);
      },
      [flash],
    );
    this.#sparks(x, y, n, 200, tint);
  }

  /** A hit: a white-hot pop, chunky sparks and the victim bursting into its own colours. */
  #impact(x: number, y: number, tint: number, victim: string | undefined): void {
    const flash = this.#scene.add
      .image(0, 0, 'fx-star')
      .setDepth(DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.#item(
      340,
      (p) => {
        const pt = this.#cam.project(x, y, 36);
        flash
          .setPosition(pt.x, pt.y)
          .setScale(0.5 + p * 1.1)
          .setAlpha((1 - p) ** 1.4)
          .setRotation(p * 0.6);
      },
      [flash],
    );
    this.#ring(x, y, 30, 170, 460, 0xffffff, 0.9);
    const kind = this.#kindOf(victim);
    const colors = PIECES[kind ?? 'BREAD'] ?? PIECES['BREAD'] ?? [tint];
    for (let i = 0; i < 18; i += 1) {
      const a = this.#rand() * Math.PI * 2;
      const v = 150 + this.#rand() * 240;
      this.#particle('fx-chunk', x, y, 30 + this.#rand() * 20, {
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.85,
        vz: 190 + this.#rand() * 220,
        gravity: 820,
        tint: colors[i % colors.length] ?? tint,
        s0: 0.4 + this.#rand() * 0.45,
        s1: 0.3,
        life: 760 + this.#rand() * 340,
        spin: 12,
        shadow: true,
      });
    }
    this.#dust(x, y, 4, 90);
    this.#sparks(x, y, 7, 300, 0xfff3b0);
  }

  /** CLANK: a big white-yellow star, shock rings and sparks thrown the way the boomerang was sent. */
  #clank(x: number, y: number, tint: number, knock: { x: number; y: number }): void {
    const star = this.#scene.add
      .image(0, 0, 'fx-star')
      .setDepth(DEPTH + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = this.#scene.add
      .image(0, 0, 'fx-glow')
      .setDepth(DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.#item(
      420,
      (p) => {
        const pt = this.#cam.project(x, y, 40);
        const pop = p < 0.22 ? p / 0.22 : 1;
        star
          .setPosition(pt.x, pt.y)
          .setScale((0.4 + pop * 0.9) * (1 - p * 0.5))
          .setAlpha((1 - p) ** 1.2)
          .setRotation(0.4 + p * 0.5);
        core
          .setPosition(pt.x, pt.y)
          .setScale(1.2 + p * 2)
          .setAlpha(0.8 * (1 - p));
      },
      [star, core],
    );
    this.#ring(x, y, 20, 160, 420, 0xffffff, 1);
    this.#ring(x, y, 20, 110, 360, tint, 0.9);
    this.#sparks(x, y, 14, 420, 0xfff3b0, knock, 1.3);
    this.#sparks(x, y, 8, 260, 0xffffff);
  }

  /** The blast, to exactly the radius the rules resolved: a hot disc, a shock ring, a ring of chunky dark debris, then specks. */
  #blast(x: number, y: number, radius: number, tint: number): void {
    const disc = this.#scene.add.image(0, 0, 'fx-disc').setDepth(DEPTH - 3);
    const edge = this.#scene.add
      .image(0, 0, 'fx-ring')
      .setDepth(DEPTH - 2)
      .setTint(0xff8a30)
      .setBlendMode(Phaser.BlendModes.ADD);
    const scorch = this.#scene.add.image(0, 0, 'char-shadow').setDepth(-85).setTint(0x2a2236);
    this.#item(
      720,
      (p) => {
        const grow = Math.min(1, p / 0.28);
        const r = radius * (1 - (1 - grow) ** 3);
        const pt = this.#cam.project(x, y);
        const s = this.#cam.groundScale(x, y);
        const fade = p < 0.3 ? 1 : 1 - (p - 0.3) / 0.7;
        disc
          .setPosition(pt.x, pt.y)
          .setDisplaySize(r * 2 * s.sx, r * 2 * s.sy)
          .setAlpha(0.95 * fade);
        edge
          .setPosition(pt.x, pt.y)
          .setDisplaySize(r * 2.12 * s.sx, r * 2.12 * s.sy)
          .setAlpha(fade);
        scorch
          .setPosition(pt.x, pt.y)
          .setDisplaySize(r * 2.2 * s.sx, r * 2.0 * s.sy)
          .setAlpha(0.35 * (1 - p * 0.6));
      },
      [disc, edge, scorch],
    );
    const dark = 0x4a3866;
    const n = 20;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + this.#rand() * 0.3;
      const reach = radius * (0.78 + this.#rand() * 0.4);
      const speed = reach / 0.55;
      this.#particle('fx-chunk', x, y, 10, {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.95,
        vz: 60 + this.#rand() * 80,
        gravity: 260,
        tint: i % 3 === 0 ? tint : dark,
        s0: 0.55 + this.#rand() * 0.35,
        s1: 0.25,
        a0: 1,
        life: 1100 + this.#rand() * 300,
        spin: 6,
        shadow: true,
      });
    }
    for (let i = 0; i < 26; i += 1) {
      const a = this.#rand() * Math.PI * 2;
      const reach = radius * (0.5 + this.#rand() * 0.9);
      this.#particle('fx-chunk', x, y, 6, {
        vx: (Math.cos(a) * reach) / 0.6,
        vy: (Math.sin(a) * reach) / 0.6,
        vz: 30,
        gravity: 120,
        tint: dark,
        s0: 0.12 + this.#rand() * 0.1,
        s1: 0.08,
        life: 1000 + this.#rand() * 500,
      });
    }
  }

  /** The slash: a swept fan with a hot core, a feathered outer arc and sparks — over the faint truth of the rules' wedge. */
  #slash(event: ViewEvent, swing: NonNullable<ViewEvent['swing']>, tint: number): void {
    const g = this.#scene.add.graphics().setDepth(DEPTH);
    const centre = Math.atan2(swing.direction.y, swing.direction.x);
    const start = centre - swing.arc / 2;
    const { x, y } = event;
    const arcPoint = (a: number, r: number): P =>
      this.#cam.project(x + Math.cos(a) * r, y + Math.sin(a) * r);
    const crescent = (
      from: number,
      to: number,
      outer: number,
      thick: number,
      color: number,
      alpha: number,
    ): void => {
      if (to - from < 0.02) return;
      const steps = 22;
      const pts: P[] = [];
      for (let i = 0; i <= steps; i += 1)
        pts.push(arcPoint(from + ((to - from) * i) / steps, outer));
      for (let i = steps; i >= 0; i -= 1) {
        const f = i / steps;
        pts.push(arcPoint(from + (to - from) * f, outer - thick * Math.sin(Math.PI * f)));
      }
      g.fillStyle(color, alpha);
      g.fillPoints(pts as Phaser.Types.Math.Vector2Like[] as never, true);
    };
    this.#dust(x, y, 3, 60);
    for (let i = 0; i < 12; i += 1) {
      const a = start + (swing.arc * i) / 11;
      this.#particle(
        'fx-spark',
        x + Math.cos(a) * swing.reach * 0.8,
        y + Math.sin(a) * swing.reach * 0.8,
        30,
        {
          vx: Math.cos(a) * 150,
          vy: Math.sin(a) * 150,
          vz: 40,
          gravity: 300,
          tint: i % 2 === 0 ? 0xfff0a0 : 0xffb33a,
          s0: 0.7,
          s1: 0.1,
          life: 400 + (i % 3) * 90,
          stretch: true,
          add: true,
        },
      );
    }
    this.#item(
      swing.seconds * 1000 + 120,
      (p) => {
        g.clear();
        const sweep = Math.min(1, p / 0.4);
        const tail = p < 0.4 ? 0 : (p - 0.4) / 0.6;
        const a0 = start + swing.arc * tail * 0.9;
        const a1 = start + swing.arc * sweep;
        const fade = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
        // the truth of the rules, faint: the wedge exactly as wide and as long as the hit region
        const wedge: P[] = [this.#cam.project(x, y)];
        for (let i = 0; i <= 18; i += 1)
          wedge.push(arcPoint(start + (swing.arc * i) / 18, swing.reach));
        g.fillStyle(tint, 0.14 * fade);
        g.fillPoints(wedge as never, true);
        // feathered outer energy, the orange body, and the white-yellow hot core
        const reach = swing.reach;
        crescent(a0, a1, reach * 1.05, reach * 0.34, 0xff8a1f, 0.22 * fade);
        crescent(a0, a1, reach * 1.0, reach * 0.28, 0xff9a2a, 0.55 * fade);
        crescent(a0 + 0.04, a1, reach * 0.97, reach * 0.2, 0xffc43a, 0.85 * fade);
        crescent(a0 + 0.08, a1, reach * 0.94, reach * 0.11, 0xfff3b0, 0.95 * fade);
        crescent(a0 + 0.12, a1, reach * 0.92, reach * 0.05, 0xffffff, fade);
      },
      [g],
    );
  }

  update(now: number): void {
    for (let i = this.#items.length - 1; i >= 0; i -= 1) {
      const it = this.#items[i] as Item;
      const p = (now - it.born) / it.duration;
      if (p >= 1) {
        it.done();
        this.#items.splice(i, 1);
      } else it.update(p, now);
    }
    for (let i = this.#particles.length - 1; i >= 0; i -= 1) {
      const q = this.#particles[i] as Particle;
      const age = now - q.born;
      const p = age / q.life;
      if (p >= 1) {
        q.img.destroy();
        q.shadow?.destroy();
        this.#particles.splice(i, 1);
        continue;
      }
      const dt = 1 / 60;
      q.vz -= q.gravity * dt;
      q.z = Math.max(0, q.z + q.vz * dt);
      if (q.z === 0 && q.vz < 0) q.vz = 0;
      q.vx *= q.z === 0 ? 0.9 : 0.995;
      q.vy *= q.z === 0 ? 0.9 : 0.995;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      const pt = this.#cam.project(q.x, q.y, q.z);
      const s = this.#cam.groundScale(q.x, q.y);
      const scale = q.s0 + (q.s1 - q.s0) * p;
      q.img.setPosition(pt.x, pt.y).setAlpha(q.a0 * (p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4));
      if (q.stretch) {
        const speed = Math.hypot(q.vx, q.vy * 0.8) / 400;
        const dir = Math.atan2(
          this.#cam.project(q.x + q.vx * 0.05, q.y + q.vy * 0.05, q.z).y - pt.y,
          this.#cam.project(q.x + q.vx * 0.05, q.y, q.z).x - pt.x,
        );
        q.img.setRotation(dir).setScale(scale * (0.8 + speed * 1.2) * s.sx, scale * s.sx);
      } else q.img.setRotation(q.rot).setScale(scale * s.sx);
      if (q.shadow !== undefined) {
        const gp = this.#cam.project(q.x + q.z * LIGHT.x * 0.5, q.y + q.z * LIGHT.y * 0.5);
        q.shadow
          .setPosition(gp.x, gp.y)
          .setDisplaySize(26 * scale * s.sx, 14 * scale * s.sy)
          .setAlpha(0.35 * (1 - p));
      }
    }
  }

  get live(): number {
    return this.#items.length + this.#particles.length;
  }
}
