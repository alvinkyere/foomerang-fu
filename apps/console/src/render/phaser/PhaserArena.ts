import * as Phaser from 'phaser';
import { AIM_BASE_OFFSET, AIM_TIP_OFFSET, nameOffset } from '../layout';
import type { ArenaRenderer, DrawnCircle } from '../renderer';
import {
  OUTLINE,
  POWER_NAME,
  POWER_STYLE,
  PHASE_COLOR,
  drawGlyph,
  spawnEffect,
  toNumber,
  type Effect,
} from './effects';
import type {
  ArenaView,
  BoomerangView,
  SystemsViewModel,
  CircleView,
  PickupView,
  ViewEvent,
  WallView,
} from '../viewModel';

/**
 * THE Phaser module. It is the only file that imports Phaser (lint-enforced) and it is loaded
 * lazily, so a lobby never downloads it. It draws an ArenaView; it holds no simulation state, runs
 * no physics and never moves anything on its own: every position on screen was handed to it.
 *
 * Everything animated here (spin, trail, flashes, fades) is PRESENTATION: derived from the view,
 * timed by Phaser's own clock, and never read back by the rules.
 */

const DIMMED_ALPHA = 0.35;
/** Walls: a mid-slate face inside a dark base, with a bright edge, against a darker floor. */
const WALL_SIDE = 0x1b2432;
const WALL_FACE = 0x56688a;
const WALL_EDGE = 0xcfd9ea;
const TRAIL_LENGTH = 9;
/** How many past positions a dashing player's streak remembers. A look, not a rule. */
const DASH_STREAK_LENGTH = 8;
/** How long a spent (round-over) projectile takes to fade away. */
const SPENT_FADE_MS = 320;

/** A Powerup Book lying in the arena: the same blue book with a red bookmark for EVERY power, and a question mark. */
class PickupSprite {
  readonly container: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, view: PickupView) {
    const book = scene.add.graphics();
    book.fillStyle(0x0c1118, 0.6);
    book.fillRoundedRect(-30, -36, 66, 78, 8); // a soft shadow
    book.fillStyle(0x2a6fdb, 1); // the cover
    book.fillRoundedRect(-34, -42, 66, 78, 8);
    book.fillStyle(0x1b4aa0, 1); // the spine
    book.fillRect(-34, -42, 10, 78);
    book.fillStyle(0xf4f1e6, 1); // the pages' edge
    book.fillRect(26, -38, 6, 70);
    book.lineStyle(4, 0xffffff, 1);
    book.strokeRoundedRect(-34, -42, 66, 78, 8);
    book.fillStyle(0xe5302f, 1); // the red bookmark hanging below
    book.fillRect(6, 30, 12, 26);
    book.fillTriangle(6, 56, 18, 56, 12, 46);
    const mark = scene.add
      .text(-1, -6, '?', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#0c1118',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.container = scene.add.container(view.x, view.y, [book, mark]).setDepth(2);
  }
  bob(time: number): void {
    this.container.setScale(1 + 0.08 * Math.sin(time / 220));
  }
  destroy(): void {
    this.container.destroy();
  }
}

class PlayerSprite {
  readonly container: Phaser.GameObjects.Container;
  readonly #shape: Phaser.GameObjects.Graphics;
  readonly #aim: Phaser.GameObjects.Graphics;
  readonly #mark: Phaser.GameObjects.Graphics;
  readonly #number: Phaser.GameObjects.Text;
  readonly #name: Phaser.GameObjects.Text;
  /** The dash streak lives in world space (not in the container, which moves with the player). */
  readonly #streak: Phaser.GameObjects.Graphics;
  /** A pulsing amber ring while the rules say the player is FATIGUED. A look, not a rule. */
  readonly #tired: Phaser.GameObjects.Graphics;
  #isTired = false;
  /** Small glyphs of every power held, under the name; a ring round the body for GUARD; a dashed one while phasing. */
  readonly #badges: Phaser.GameObjects.Graphics;
  readonly #guard: Phaser.GameObjects.Graphics;
  readonly #phase: Phaser.GameObjects.Graphics;
  #powersKey = '';
  readonly #streakPoints: { x: number; y: number }[] = [];
  #styleKey = '';
  #aimKey = '';

  constructor(scene: Phaser.Scene) {
    this.#streak = scene.add.graphics().setDepth(-1); // under the player, over the floor and walls
    this.#shape = scene.add.graphics();
    this.#tired = scene.add.graphics().setVisible(false);
    this.#badges = scene.add.graphics();
    this.#guard = scene.add.graphics().setVisible(false);
    this.#phase = scene.add.graphics().setVisible(false);
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
      this.#guard,
      this.#phase,
      this.#badges,
      this.#tired,
      this.#shape,
      this.#aim,
      this.#number,
      this.#name,
      this.#mark,
    ]);
  }

  apply(circle: CircleView): void {
    this.container.setPosition(circle.x, circle.y);
    // a player part-way through a Phase Dash is drawn see-through, so it is plain they are passing a wall
    this.container.setAlpha(
      circle.dimmed
        ? DIMMED_ALPHA
        : circle.phasing === undefined
          ? 1
          : circle.phasing.inWall
            ? 0.4
            : 0.65,
    );
    this.#drawPowers(circle);
    this.#drawStreak(circle);
    const tired = circle.fatigued === true;
    if (tired !== this.#isTired) {
      this.#isTired = tired;
      this.#tired.clear();
      if (tired) {
        this.#tired.lineStyle(9, 0xffb020, 1);
        this.#tired.strokeCircle(0, 0, circle.radius + 14);
        this.#tired.lineStyle(4, 0x000000, 0.6);
        this.#tired.strokeCircle(0, 0, circle.radius + 21);
        // three "sweat" drops falling off the top edge
        this.#tired.fillStyle(0x9fd8ff, 1);
        for (const dx of [-16, 0, 16]) this.#tired.fillCircle(dx, -circle.radius - 30, 6);
      }
      this.#tired.setVisible(tired);
    }

    const key = `${circle.shape}|${circle.color}|${circle.radius}|${circle.number}|${circle.label}`;
    if (key !== this.#styleKey) {
      this.#styleKey = key;
      this.#draw(circle);
      this.#number.setText(circle.number > 0 ? String(circle.number) : '');
      this.#name.setText(circle.label).setY(nameOffset(circle.radius));
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

  /** While the rules say the player is dashing: ghosts of where they just were, and a bright streak joining them. */
  #drawPowers(circle: CircleView): void {
    const key = `${circle.powers.join(',')}|${circle.phasing === undefined ? '' : 'p'}|${circle.radius}`;
    if (key === this.#powersKey) return;
    this.#powersKey = key;
    const g = this.#badges;
    g.clear();
    const row = circle.powers;
    // three slots, oldest on the left; an empty slot is a thin dashed frame
    for (let i = 0; i < 3; i += 1) {
      const x = (i - 1) * 34;
      const y = nameOffset(circle.radius) + 56;
      const kind = row[i];
      g.fillStyle(0x0c1118, kind === undefined ? 0.35 : 0.85);
      g.fillCircle(x, y, 15);
      g.lineStyle(
        kind === undefined ? 2 : 3,
        kind === undefined ? 0x56688a : POWER_STYLE[kind].color,
        1,
      );
      g.strokeCircle(x, y, 15);
      if (kind !== undefined) {
        g.save();
        g.translateCanvas(x, y);
        drawGlyph(g, kind, 8);
        g.restore();
      }
    }
    this.#guard.clear();
    const guarded = row.includes('GUARD');
    if (guarded) {
      this.#guard.lineStyle(7, POWER_STYLE.GUARD.color, 0.95);
      this.#guard.strokeCircle(0, 0, circle.radius + 9);
    }
    this.#guard.setVisible(guarded);
    this.#phase.clear();
    if (circle.phasing !== undefined) {
      this.#phase.lineStyle(6, PHASE_COLOR, 1);
      for (let i = 0; i < 12; i += 2) {
        this.#phase.beginPath();
        this.#phase.arc(0, 0, circle.radius + 8, (Math.PI / 6) * i, (Math.PI / 6) * (i + 1), false);
        this.#phase.strokePath();
      }
    }
    this.#phase.setVisible(circle.phasing !== undefined);
  }

  /** Called every frame: the tired ring breathes, so it cannot be mistaken for a static outline. */
  pulse(time: number): void {
    if (this.#isTired) this.#tired.setAlpha(0.55 + 0.4 * Math.sin(time / 130));
  }

  #drawStreak(circle: CircleView): void {
    const g = this.#streak;
    if (circle.dashing === undefined) {
      if (this.#streakPoints.length > 0) {
        this.#streakPoints.length = 0;
        g.clear();
      }
      return;
    }
    const last = this.#streakPoints.at(-1);
    if (last === undefined || last.x !== circle.x || last.y !== circle.y) {
      this.#streakPoints.push({ x: circle.x, y: circle.y });
      if (this.#streakPoints.length > DASH_STREAK_LENGTH) this.#streakPoints.shift();
    }
    g.clear();
    const colour = toNumber(circle.color);
    const count = this.#streakPoints.length;
    const first = this.#streakPoints[0];
    if (first !== undefined) {
      g.lineStyle(circle.radius * 1.2, colour, 0.35);
      g.lineBetween(first.x, first.y, circle.x, circle.y);
    }
    this.#streakPoints.forEach((point, index) => {
      const t = (index + 1) / count;
      g.fillStyle(colour, 0.5 * t);
      g.fillCircle(point.x, point.y, circle.radius * (0.55 + 0.4 * t));
    });
  }

  #drawAim(circle: CircleView): void {
    const g = this.#aim;
    g.clear();
    if (circle.facing === undefined || circle.dead) return;
    const r = circle.radius;
    const angle = Math.atan2(circle.facing.y, circle.facing.x);
    const tip = r + AIM_TIP_OFFSET;
    const base = r + AIM_BASE_OFFSET;
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
    this.#streak.destroy();
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
  /** When (Phaser time) the round ended on this projectile; undefined while it is live. */
  #spentAt: number | undefined;
  #pendingSpent = false;
  /** A deflected boomerang trails white, so it is plain whose weapon is flying wrong. */
  #deflected = false;
  /** Armed with BLAST_BOOMERANG: a red-orange ring round it, so it is plain which one will explode. */
  #blast = false;

  constructor(scene: Phaser.Scene) {
    this.#trail = scene.add.graphics();
    this.#body = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.#body]);
  }

  apply(view: BoomerangView): void {
    this.#pendingSpent = view.spent;
    this.#deflected = view.state === 'DEFLECTED';
    this.#blast = view.blast;
    if (!view.spent) {
      this.#spentAt = undefined;
      this.container.setAlpha(1);
      this.#trail.setAlpha(1);
    }
    this.container.setPosition(view.x, view.y);
    this.#color = toNumber(view.color);
    this.#radius = view.radius;
    const key = `${view.color}|${view.radius}|${view.blast}`;
    if (key !== this.#drawnKey) {
      this.#drawnKey = key;
      this.#drawBody();
    }
    if (view.spent) {
      this.#drawTrail();
      return;
    }
    const last = this.#history.at(-1);
    if (last === undefined || last.x !== view.x || last.y !== view.y) {
      this.#history.push({ x: view.x, y: view.y });
      if (this.#history.length > TRAIL_LENGTH) this.#history.shift();
    }
    this.#drawTrail();
  }

  /**
   * Live projectiles spin. Once the round is over the rules freeze it where it was; instead of
   * leaving it (and its trail) sitting on the victim for the whole pause, it stops and fades out.
   */
  spin(time: number): void {
    if (!this.#pendingSpent) {
      this.container.setRotation(time / 55);
      return;
    }
    this.#spentAt ??= time;
    const alpha = Math.max(0, 1 - (time - this.#spentAt) / SPENT_FADE_MS);
    this.container.setAlpha(alpha);
    this.#trail.setAlpha(alpha * 0.5);
  }

  #drawBody(): void {
    const g = this.#body;
    const r = this.#radius * 1.7;
    g.clear();
    if (this.#blast) {
      g.lineStyle(7, POWER_STYLE.BLAST_BOOMERANG.color, 1);
      g.strokeCircle(0, 0, this.#radius * 2.3);
    }
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
      g.fillStyle(this.#deflected ? 0xffffff : this.#color, 0.45 * t);
      g.fillCircle(point.x, point.y, this.#radius * (0.35 + 0.5 * t));
    });
  }

  destroy(): void {
    this.#trail.destroy();
    this.container.destroy();
  }
}

/** A rectangle outlined with dashes (so "open / safe / not solid" reads differently from a solid frame). */
function dashedRect(g: Phaser.GameObjects.Graphics, r: WallView, dash = 16): void {
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.floor(length / dash));
    for (let i = 0; i < n; i += 2) {
      g.lineBetween(
        x1 + ((x2 - x1) * i) / n,
        y1 + ((y2 - y1) * i) / n,
        x1 + ((x2 - x1) * Math.min(i + 1, n)) / n,
        y1 + ((y2 - y1) * Math.min(i + 1, n)) / n,
      );
    }
  };
  edge(r.x, r.y, r.x + r.width, r.y);
  edge(r.x + r.width, r.y, r.x + r.width, r.y + r.height);
  edge(r.x + r.width, r.y + r.height, r.x, r.y + r.height);
  edge(r.x, r.y + r.height, r.x, r.y);
}

/** Diagonal hazard stripes across a rectangle, clipped to it. */
function stripes(g: Phaser.GameObjects.Graphics, r: WallView, gap: number, offset: number): void {
  for (let k = -r.height; k < r.width; k += gap) {
    const x0 = r.x + k + (offset % gap);
    const x1 = x0 + r.height;
    const cx = (v: number) => Math.min(Math.max(v, r.x), r.x + r.width);
    // the line y = r.y + (x − x0), clipped to the rectangle's x range
    const a = cx(x0);
    const b = cx(x1);
    if (b > a) g.lineBetween(a, r.y + (a - x0), b, r.y + (b - x0));
  }
}

class ArenaScene extends Phaser.Scene {
  readonly #sprites = new Map<string, PlayerSprite>();
  readonly #boomerangs = new Map<string, BoomerangSprite>();
  readonly #pickups = new Map<number, PickupSprite>();
  #effects: Effect[] = [];
  #walls: Phaser.GameObjects.Graphics | undefined;
  #wallsKey = '';
  #wallViews: readonly WallView[] = [];
  #banner: Phaser.GameObjects.Text | undefined;
  #roundLabel: Phaser.GameObjects.Text | undefined;
  /** The interactive arena systems (gates, platforms, hazards), redrawn every frame so telegraphs can blink. */
  #systems: Phaser.GameObjects.Graphics | undefined;
  #systemsView: SystemsViewModel | undefined;
  /** Who owns what, in the order they got it: a plain text list in the corner. */
  #inventoryList: Phaser.GameObjects.Text | undefined;
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
    this.#inventoryList = this.add
      .text(24, 56, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        color: '#c9d4e3',
        lineSpacing: 6,
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
      flying.add(boomerang.id);
      let sprite = this.#boomerangs.get(boomerang.id);
      if (sprite === undefined) {
        sprite = new BoomerangSprite(this);
        this.#boomerangs.set(boomerang.id, sprite);
      }
      sprite.apply(boomerang);
    }
    for (const [id, sprite] of this.#boomerangs) {
      if (!flying.has(id)) {
        sprite.destroy();
        this.#boomerangs.delete(id);
      }
    }

    const lying = new Set<number>();
    for (const pickup of view.pickups) {
      lying.add(pickup.id);
      if (!this.#pickups.has(pickup.id))
        this.#pickups.set(pickup.id, new PickupSprite(this, pickup));
    }
    for (const [id, sprite] of this.#pickups) {
      if (!lying.has(id)) {
        sprite.destroy();
        this.#pickups.delete(id);
      }
    }

    for (const event of view.events) this.#spawnEffect(event);

    this.#showWalls(view.walls);
    this.#systemsView = view.systems;

    if (this.#banner !== undefined) {
      this.#banner.setPosition(view.width / 2, view.height / 2 - 40);
      this.#banner.setText(view.banner ?? '').setVisible(view.banner !== undefined);
    }
    this.#inventoryList?.setText(
      view.circles
        .map((c) => {
          const slots = [0, 1, 2].map((i) => {
            const kind = c.powers[i];
            return kind === undefined ? '[ — ]' : `[${POWER_NAME[kind]}]`;
          });
          return `${c.label}  ${slots.join(' ')}`;
        })
        .join('\n'),
    );
    this.#roundLabel?.setText(view.round === undefined ? '' : `Round ${view.round}`);
  }

  /** The arena's geometry, exactly as the rules hand it over. Redrawn only when it changes. */
  #showWalls(walls: readonly WallView[]): void {
    const key = walls.map((w) => `${w.x},${w.y},${w.width},${w.height}`).join('|');
    if (key === this.#wallsKey) return;
    this.#wallsKey = key;
    this.#wallViews = walls.map((w) => ({ ...w }));
    this.#walls ??= this.add.graphics().setDepth(-5); // under the players, over the floor
    const g = this.#walls;
    g.clear();
    for (const w of walls) {
      g.fillStyle(WALL_SIDE, 1); // a slab with a lit top edge and a dark base, so cover reads as solid
      g.fillRect(w.x, w.y, w.width, w.height);
      g.fillStyle(WALL_FACE, 1);
      g.fillRect(w.x + 5, w.y + 5, w.width - 10, w.height - 14);
      g.lineStyle(5, WALL_EDGE, 1);
      g.strokeRect(w.x, w.y, w.width, w.height);
    }
  }

  drawnWalls(): readonly WallView[] {
    return this.#wallViews;
  }

  drawnSystems(): SystemsViewModel | undefined {
    return this.#systemsView;
  }

  /**
   * Telegraphs, from the rules' state only. HAZARD: SAFE is a faint dashed red outline; WARNING is an amber
   * striped, blinking fill that blinks faster as it nears ACTIVE; ACTIVE is a solid red fill with bright
   * stripes. GATE: OPEN is a green dashed frame; CLOSING (and held-open) is a blinking amber/red frame;
   * CLOSED is a solid dark barred slab. PLATFORM: a blue slab with chevrons in its direction of travel, and
   * pause bars while it waits at an end.
   */
  #drawSystems(time: number): void {
    const view = this.#systemsView;
    if (
      view === undefined ||
      view.gates.length + view.platforms.length + view.hazards.length === 0
    ) {
      this.#systems?.clear();
      return;
    }
    this.#systems ??= this.add.graphics().setDepth(-4);
    const g = this.#systems;
    g.clear();
    for (const h of view.hazards) {
      const r = h.rect;
      if (h.phase === 'SAFE') {
        g.fillStyle(0xb02a2a, 0.1);
        g.fillRect(r.x, r.y, r.width, r.height);
        g.lineStyle(4, 0xb02a2a, 0.55);
        dashedRect(g, r);
      } else if (h.phase === 'WARNING') {
        const rate = 140 - 90 * Math.max(0, 1 - h.secondsToChange); // blinks faster as ACTIVE nears
        const lit = Math.floor(time / rate) % 2 === 0;
        g.fillStyle(0xffb020, lit ? 0.5 : 0.18);
        g.fillRect(r.x, r.y, r.width, r.height);
        g.lineStyle(6, 0xffd23f, lit ? 1 : 0.6);
        g.strokeRect(r.x, r.y, r.width, r.height);
        g.lineStyle(8, 0x1a1200, 0.55);
        stripes(g, r, 40, 0);
      } else {
        g.fillStyle(0xe5302f, 0.72);
        g.fillRect(r.x, r.y, r.width, r.height);
        g.lineStyle(8, 0xffffff, 0.9);
        stripes(g, r, 36, (time / 6) % 36);
        g.lineStyle(8, 0xff6a5c, 1);
        g.strokeRect(r.x, r.y, r.width, r.height);
      }
    }
    for (const p of view.platforms) {
      const r = p.rect;
      g.fillStyle(0x2b6cb0, 0.9);
      g.fillRect(r.x, r.y, r.width, r.height);
      g.lineStyle(5, 0x9fd0ff, 1);
      g.strokeRect(r.x, r.y, r.width, r.height);
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (p.moving) {
        // three chevrons pointing the way it is going
        g.lineStyle(6, 0xffffff, 0.95);
        for (let i = -1; i <= 1; i += 1) {
          const bx = cx + p.direction.x * i * 22;
          const by = cy + p.direction.y * i * 22;
          const nx = -p.direction.y;
          const ny = p.direction.x;
          g.lineBetween(
            bx - p.direction.x * 8 + nx * 16,
            by - p.direction.y * 8 + ny * 16,
            bx + p.direction.x * 8,
            by + p.direction.y * 8,
          );
          g.lineBetween(
            bx - p.direction.x * 8 - nx * 16,
            by - p.direction.y * 8 - ny * 16,
            bx + p.direction.x * 8,
            by + p.direction.y * 8,
          );
        }
      } else {
        g.fillStyle(0xffffff, 0.9); // waiting at an end: pause bars
        g.fillRect(cx - 16, cy - 18, 10, 36);
        g.fillRect(cx + 6, cy - 18, 10, 36);
      }
    }
    for (const gate of view.gates) {
      const r = gate.rect;
      if (gate.status === 'OPEN') {
        g.fillStyle(0x3ddc84, 0.12);
        g.fillRect(r.x, r.y, r.width, r.height);
        g.lineStyle(5, 0x3ddc84, 0.95);
        dashedRect(g, r, 14);
      } else if (gate.status === 'CLOSING') {
        const lit = Math.floor(time / (gate.held ? 90 : 160)) % 2 === 0;
        const colour = gate.held ? 0xff5a36 : 0xffb020;
        g.fillStyle(colour, lit ? 0.5 : 0.15);
        g.fillRect(r.x, r.y, r.width, r.height);
        g.lineStyle(7, colour, lit ? 1 : 0.55);
        g.strokeRect(r.x, r.y, r.width, r.height);
      } else {
        g.fillStyle(0x3b1d1d, 1);
        g.fillRect(r.x, r.y, r.width, r.height);
        g.lineStyle(6, 0xff6a5c, 1);
        g.strokeRect(r.x, r.y, r.width, r.height);
        g.lineStyle(5, 0xff6a5c, 0.8); // bars
        for (let y = r.y + 14; y < r.y + r.height; y += 22)
          g.lineBetween(r.x + 4, y, r.x + r.width - 4, y);
      }
    }
  }

  override update(time: number): void {
    this.#drawSystems(time);
    for (const sprite of this.#boomerangs.values()) sprite.spin(time);
    for (const sprite of this.#sprites.values()) sprite.pulse(time);
    for (const sprite of this.#pickups.values()) sprite.bob(time);
    this.#effects = this.#effects.filter((effect) => {
      const progress = (time - effect.born) / effect.duration;
      if (progress >= 1) {
        effect.graphics.destroy();
        effect.extra?.destroy();
        return false;
      }
      effect.update(effect.graphics, progress);
      effect.extra?.setAlpha(Math.min(1, 2.2 * (1 - progress))).setY(effect.extra.y - 0.35);
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

  drawnPickups(): readonly DrawnCircle[] {
    return [...this.#pickups].map(([id, sprite]) => ({
      id: String(id),
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
    spawnEffect(this, event, this.#effects, {
      pen: this.add.graphics().setDepth(5),
      at: (x, y) => ({ x, y }),
    });
  }
}

function drawBackdrop(scene: Phaser.Scene, width: number, height: number): void {
  const g = scene.add.graphics().setDepth(-10); // the floor: under the walls, which are under everything alive
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
        drawnPickups: () => scene.drawnPickups(),
        drawnWalls: () => scene.drawnWalls(),
        drawnSystems: () => scene.drawnSystems(),
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
