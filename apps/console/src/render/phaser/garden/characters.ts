import * as Phaser from 'phaser';
import type { PowerKind } from '@foomerang/foomerang-fu';
import { POWER_STYLE, drawGlyph } from '../effects';

/**
 * Garden's four characters, drawn as little vector toys (no image assets): Bread Slice, Coffee Cup, the pumpkin-like orange
 * and the light-green fruit. Which one a player is is COSMETIC and follows their seat; every character is the same gameplay
 * body (the rules never hear of them). Everything animated here — bob, waddle, squash, spin, hop — is presentation: it never
 * feeds movement, reach or timing back to the rules.
 */
export type CharacterKind = 'BREAD' | 'COFFEE' | 'PUMPKIN' | 'FRUIT';
export const CHARACTERS: readonly CharacterKind[] = ['BREAD', 'COFFEE', 'PUMPKIN', 'FRUIT'];
/** Seats 1–4 are the four characters; seats 5 and 6 repeat Bread and Coffee (their colour ring tells them apart). */
export const characterForNumber = (number: number): CharacterKind =>
  CHARACTERS[Math.max(0, number - 1) % CHARACTERS.length] as CharacterKind;

type G = Phaser.GameObjects.Graphics;
const EYE = 0x2b2230;
const BLUSH = 0xff9aa8;
const SHOE = 0x7a4a2a;

/** The body of each character, drawn once, around (0, 0) at their feet, about 70 px tall. */
function drawBody(g: G, kind: CharacterKind): void {
  g.clear();
  switch (kind) {
    case 'BREAD':
      g.fillStyle(0xbf8340, 1);
      g.fillRoundedRect(-31, -72, 62, 62, 18);
      g.fillCircle(-21, -70, 15);
      g.fillCircle(21, -70, 15);
      g.fillStyle(0xf6dfae, 1);
      g.fillRoundedRect(-26, -67, 52, 52, 14);
      g.fillCircle(-21, -68, 11);
      g.fillCircle(21, -68, 11);
      g.fillStyle(0xffffff, 0.35);
      g.fillEllipse(-14, -58, 18, 10);
      break;
    case 'COFFEE':
      g.lineStyle(7, 0xeef0f6, 1);
      g.strokeEllipse(-31, -34, 17, 24);
      g.fillStyle(0xf4f5f9, 1);
      g.fillRoundedRect(-27, -62, 54, 52, 12);
      g.fillStyle(0xd7dae7, 1);
      g.fillRoundedRect(11, -62, 16, 52, 10);
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(0, -62, 58, 24);
      g.fillStyle(0x5e341f, 1);
      g.fillEllipse(0, -62, 46, 17);
      g.fillStyle(0x8a5638, 0.8);
      g.fillEllipse(-8, -64, 16, 6);
      break;
    case 'PUMPKIN':
      g.fillStyle(0xe27a14, 1);
      g.fillCircle(0, -36, 33);
      g.fillStyle(0xf0891f, 1);
      g.fillCircle(0, -38, 31);
      g.lineStyle(3, 0xd0680f, 0.9);
      g.strokeEllipse(0, -38, 44, 62);
      g.strokeEllipse(0, -38, 18, 62);
      g.fillStyle(0xffb85c, 0.7);
      g.fillEllipse(-13, -54, 15, 9);
      g.fillStyle(0x6b5a2a, 1);
      g.fillRect(-3, -76, 6, 11);
      g.fillStyle(0x4c9a3a, 1);
      g.fillTriangle(2, -68, 26, -78, 14, -62);
      g.fillStyle(0x6cba4c, 1);
      g.fillTriangle(-2, -68, -22, -76, -12, -62);
      break;
    case 'FRUIT':
      g.fillStyle(0x93c765, 1);
      g.fillEllipse(0, -32, 60, 54);
      g.fillStyle(0xa9d97d, 1);
      g.fillEllipse(0, -35, 56, 48);
      g.fillStyle(0xdaf3b9, 0.85);
      g.fillEllipse(-13, -50, 16, 10);
      g.fillStyle(0x7a5a3a, 1);
      g.fillRect(-2, -66, 4, 11);
      g.fillStyle(0x8cc65e, 1);
      g.fillEllipse(-12, -68, 22, 11);
      g.fillEllipse(12, -70, 22, 11);
      break;
  }
}

const faceY: Record<CharacterKind, number> = { BREAD: -38, COFFEE: -33, PUMPKIN: -30, FRUIT: -32 };

type Mood = 'NORMAL' | 'HAPPY' | 'HIT' | 'FIERCE';

function drawFace(g: G, kind: CharacterKind, mood: Mood): void {
  g.clear();
  const y = faceY[kind];
  const gap = kind === 'COFFEE' ? 10 : 11;
  g.lineStyle(3, EYE, 1);
  g.fillStyle(EYE, 1);
  for (const dx of [-gap, gap]) {
    if (mood === 'HIT') {
      g.lineBetween(dx - 4, y - 4, dx + 4, y + 4);
      g.lineBetween(dx - 4, y + 4, dx + 4, y - 4);
    } else if (mood === 'HAPPY') {
      g.beginPath();
      g.arc(dx, y + 1, 4.5, Math.PI, 0, false);
      g.strokePath();
    } else {
      g.fillEllipse(dx, y, 6.4, mood === 'FIERCE' ? 5 : 8);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(dx - 1.3, y - 1.6, 1.4);
      g.fillStyle(EYE, 1);
    }
  }
  g.fillStyle(BLUSH, 0.55);
  g.fillEllipse(-gap - 8, y + 6, 9, 5);
  g.fillEllipse(gap + 8, y + 6, 9, 5);
  g.lineStyle(2.5, EYE, 1);
  g.beginPath();
  if (mood === 'HIT') g.arc(0, y + 12, 4, 0, Math.PI * 2, false);
  else if (mood === 'FIERCE') {
    g.moveTo(-5, y + 11);
    g.lineTo(5, y + 11);
  } else g.arc(0, y + 7, 5, 0.15 * Math.PI, 0.85 * Math.PI, false);
  g.strokePath();
}

export interface CharacterState {
  /** Where the feet are on screen, and the size of one world unit there. */
  readonly x: number;
  readonly y: number;
  readonly k: number;
  /** The ground footprint's size on screen, in pixels (the body's true radius, foreshortened). */
  readonly ringRx: number;
  readonly ringRy: number;
  readonly facing: { x: number; y: number };
  /** World units per second the body is actually moving (from successive views). */
  readonly speed: number;
  readonly dead: boolean;
  readonly armed: boolean;
  readonly dashing: boolean;
  readonly fatigued: boolean;
  readonly phasing: 'none' | 'open' | 'wall';
  readonly dimmed: boolean;
  readonly victorious: boolean;
  readonly color: number;
  readonly label: string;
  readonly number: number;
  readonly powers: readonly PowerKind[];
}

/** One player on screen: a character with a name, a colour ring at their feet, animation and the power badges. */
export class CharacterSprite {
  readonly container: Phaser.GameObjects.Container;
  readonly #kind: CharacterKind;
  readonly #ground: G;
  readonly #body: Phaser.GameObjects.Container;
  readonly #art: G;
  readonly #face: G;
  readonly #feet: G;
  readonly #arms: G;
  readonly #name: Phaser.GameObjects.Text;
  readonly #badges: G;
  #phase = 0;
  #mood: Mood = 'NORMAL';
  #actionAt = -9999;
  #action: 'THROW' | 'SLASH' | 'NONE' = 'NONE';
  #powersKey = '';
  #last = 0;
  /** Where the feet are on screen right now (for the occlusion test). */
  screen = { x: 0, y: 0 };
  /** The character's silhouette on screen: a box from the feet up. */
  box = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(scene: Phaser.Scene, kind: CharacterKind) {
    this.#kind = kind;
    this.#ground = scene.add.graphics();
    this.#art = scene.add.graphics();
    this.#face = scene.add.graphics();
    this.#feet = scene.add.graphics();
    this.#arms = scene.add.graphics();
    this.#body = scene.add.container(0, 0, [this.#feet, this.#art, this.#arms, this.#face]);
    this.#name = scene.add
      .text(0, -86, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2a2f55',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1);
    this.#badges = scene.add.graphics();
    this.container = scene.add.container(0, 0, [
      this.#ground,
      this.#body,
      this.#name,
      this.#badges,
    ]);
    drawBody(this.#art, kind);
    drawFace(this.#face, kind, 'NORMAL');
  }

  /** A THROW or SLASH the rules just resolved: a short wind-up or spin. */
  act(what: 'THROW' | 'SLASH', now: number): void {
    this.#action = what;
    this.#actionAt = now;
  }

  update(s: CharacterState, now: number): void {
    const dt = Math.min(64, now - this.#last || 16);
    this.#last = now;
    const moving = Math.min(1, s.speed / 300);
    this.#phase += (dt / 1000) * (6 + moving * 9) * (moving > 0.05 ? 1 : 0.4);
    const t = now / 1000;

    // mood
    let mood: Mood = 'NORMAL';
    if (s.dead) mood = 'HIT';
    else if (s.victorious) mood = 'HAPPY';
    else if (now - this.#actionAt < 260 || s.dashing) mood = 'FIERCE';
    if (mood !== this.#mood) {
      this.#mood = mood;
      drawFace(this.#face, this.#kind, mood);
    }

    // body animation (squash, stretch, waddle, spin, hop): look only
    let sx = 1 + 0.012 * Math.sin(t * 3.4);
    let sy = 1 - 0.02 * Math.sin(t * 3.4);
    let rot = Math.sin(this.#phase) * 0.12 * moving;
    let lift = Math.abs(Math.sin(this.#phase)) * 6 * moving;
    const since = now - this.#actionAt;
    if (s.dead) {
      sx = 1.28;
      sy = 0.36;
      rot = 0;
      lift = 0;
    } else if (s.victorious) {
      lift = Math.abs(Math.sin(t * 8)) * 24;
      sy = 1 + 0.08 * Math.sin(t * 16);
      rot = Math.sin(t * 8) * 0.1;
    } else if (s.dashing) {
      sx = 1.2;
      sy = 0.86;
      rot = 0.25 * Math.sign(s.facing.x || 1);
    } else if (this.#action === 'SLASH' && since < 300) {
      rot = (since / 300) * Math.PI * 2 * Math.sign(s.facing.x || 1);
      sy = 1.06;
    } else if (this.#action === 'THROW' && since < 240) {
      const p = since / 240;
      sy = 1 - 0.16 * Math.sin(p * Math.PI);
      sx = 1 + 0.1 * Math.sin(p * Math.PI);
      rot = -0.22 * Math.sin(p * Math.PI) * Math.sign(s.facing.x || 1);
    }
    this.#body.setScale(sx, sy).setRotation(rot).setY(-lift);

    // little feet and arms
    const f = this.#feet;
    f.clear();
    f.fillStyle(SHOE, 1);
    const stride = Math.sin(this.#phase) * 5 * moving;
    f.fillEllipse(-11, -3 + stride, 14, 9);
    f.fillEllipse(11, -3 - stride, 14, 9);
    const a = this.#arms;
    a.clear();
    a.fillStyle(this.#kind === 'COFFEE' ? 0xf4f5f9 : 0xe9b9a0, 1);
    const up = s.victorious ? -22 : 0;
    const swing = Math.sin(this.#phase + Math.PI) * 4 * moving;
    const armY = s.victorious ? -50 : -30;
    a.fillCircle(-35, armY + up * 0.2 + swing, 5.5);
    a.fillCircle(35, armY + up * 0.2 - swing, 5.5);

    // placement
    this.container.setPosition(s.x, s.y).setScale(s.k);
    this.container.setAlpha(
      s.dimmed && !s.dead ? 0.45 : s.phasing === 'wall' ? 0.45 : s.phasing === 'open' ? 0.7 : 1,
    );
    this.screen = { x: s.x, y: s.y };
    this.box = { x0: s.x - 44 * s.k, y0: s.y - 100 * s.k, x1: s.x + 44 * s.k, y1: s.y + 8 * s.k };

    // the ground: shadow, the colour ring that IS the body's footprint, the way they face, shield and tiredness
    const g = this.#ground;
    g.clear();
    const rx = s.ringRx / s.k;
    const ry = s.ringRy / s.k;
    g.fillStyle(0x1b3a1b, 0.28);
    g.fillEllipse(3, 4, rx * 2.1, ry * 2.1);
    if (!s.dead) {
      g.lineStyle(5, s.color, 0.95);
      g.strokeEllipse(0, 0, rx * 2, ry * 2);
      g.lineStyle(2, 0xffffff, 0.6);
      g.strokeEllipse(0, 0, rx * 2 - 7, ry * 2 - 7);
      const fx = s.facing.x;
      const fy = s.facing.y;
      const tip = { x: fx * (rx + 20), y: fy * (ry + 20) };
      const base = { x: fx * (rx + 3), y: fy * (ry + 3) };
      const px = -fy * 8;
      const py = fx * 5;
      g.fillStyle(s.armed ? s.color : 0xffffff, s.armed ? 0.95 : 0.35);
      g.fillTriangle(base.x + px, base.y + py, base.x - px, base.y - py, tip.x, tip.y);
      if (!s.armed) {
        g.lineStyle(2, s.color, 0.8);
        g.strokeTriangle(base.x + px, base.y + py, base.x - px, base.y - py, tip.x, tip.y);
      }
      if (s.fatigued) {
        g.lineStyle(6, 0xffb020, 0.9);
        g.strokeEllipse(0, 0, rx * 2 + 16, ry * 2 + 16);
      }
      if (s.phasing !== 'none') {
        g.lineStyle(4, POWER_STYLE.PHASE_DASH.color, 0.9);
        g.strokeEllipse(0, 0, rx * 2 + 10, ry * 2 + 10);
      }
    }
    if (s.powers.includes('GUARD') && !s.dead) {
      g.lineStyle(5, POWER_STYLE.GUARD.color, 0.9);
      g.strokeEllipse(0, -30, 92, 100);
      g.fillStyle(POWER_STYLE.GUARD.color, 0.12);
      g.fillEllipse(0, -30, 92, 100);
    }
    if (s.fatigued && !s.dead) {
      g.fillStyle(0x9fd8ff, 0.95);
      for (const dx of [-14, 0, 14]) g.fillCircle(dx, -80 + ((t * 40 + dx) % 10), 3);
    }

    // name and badges
    const key = `${s.label}|${s.number}|${s.powers.join(',')}`;
    if (key !== this.#powersKey) {
      this.#powersKey = key;
      this.#name.setText(s.label);
      const b = this.#badges;
      b.clear();
      for (let i = 0; i < 3; i += 1) {
        const kind = s.powers[i];
        const bx = (i - 1) * 24;
        if (kind === undefined) {
          b.lineStyle(2, 0xffffff, 0.35);
          b.strokeCircle(bx, -112, 8);
        } else {
          b.fillStyle(0x1a1f3a, 0.8);
          b.fillCircle(bx, -112, 11);
          b.save();
          b.translateCanvas(bx, -112);
          drawGlyph(b, kind, 8);
          b.restore();
        }
      }
    }
    this.#name.setAlpha(s.dead ? 0.5 : 1);
  }

  destroy(): void {
    this.container.destroy();
  }
}
