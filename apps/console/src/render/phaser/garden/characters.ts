import * as Phaser from 'phaser';
import type { PowerKind } from '@foomerang/foomerang-fu';
import { POWER_STYLE, drawGlyph } from '../effects';
import { SS, type CharacterArt, type Mood } from './charArt';

/**
 * One player on screen: a plush character with a soft contact shadow, a colour ring that IS the body's footprint, a name, the
 * power badges, and the animation language of the reference — lean into movement, stride bounce, start/stop squash, a
 * motion smear in the character's own colour, a spinning slash, a wind-up throw, a dash stretch, a flattened death and a
 * victory hop. Everything is presentation: it never feeds movement, reach or timing back to the rules.
 */
export { characterForNumber, type CharacterKind } from './characterKinds';

type G = Phaser.GameObjects.Graphics;

export interface CharacterState {
  readonly x: number;
  readonly y: number;
  /** Size of one world unit on screen here (px). */
  readonly k: number;
  /** The ground footprint's size on screen (the body's true radius, foreshortened). */
  readonly ringRx: number;
  readonly ringRy: number;
  readonly facing: { x: number; y: number };
  /** World units per second the body is actually moving (from successive views). */
  readonly speed: number;
  /** The direction of that movement on screen (unit), or zero. */
  readonly heading: { x: number; y: number };
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

const TRAIL = 22;

export class CharacterSprite {
  readonly container: Phaser.GameObjects.Container;
  readonly #art: CharacterArt;
  readonly #shadow: Phaser.GameObjects.Image;
  readonly #cast: Phaser.GameObjects.Image;
  readonly #ground: G;
  readonly #trail: G;
  readonly #rig: Phaser.GameObjects.Container;
  readonly #body: Phaser.GameObjects.Image;
  readonly #face: Phaser.GameObjects.Image;
  readonly #armL: Phaser.GameObjects.Image;
  readonly #armR: Phaser.GameObjects.Image;
  readonly #footL: Phaser.GameObjects.Image;
  readonly #footR: Phaser.GameObjects.Image;
  readonly #name: Phaser.GameObjects.Text;
  readonly #badges: G;
  readonly #history: { x: number; y: number }[] = [];
  #phase = 0;
  #mood: Mood = 'NORMAL';
  #actionAt = -9999;
  #action: 'THROW' | 'SLASH' | 'NONE' = 'NONE';
  #squash = 0;
  #lastSpeed = 0;
  #flip = 1;
  #key = '';
  #last = 0;
  /** Where the feet are on screen right now (for the occlusion test). */
  screen = { x: 0, y: 0 };
  /** The character's silhouette on screen: a box from the feet up. */
  box = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(scene: Phaser.Scene, art: CharacterArt, shadowKey: string) {
    this.#art = art;
    const spec = art.spec;
    const part = (key: string, origin: { x: number; y: number }): Phaser.GameObjects.Image => {
      const img = scene.add.image(0, 0, key);
      return img.setOrigin(origin.x / img.width, origin.y / img.height).setScale(1 / SS);
    };
    const soft = (): Phaser.GameObjects.Image => scene.add.image(0, 0, shadowKey);
    this.#trail = scene.add.graphics();
    this.#shadow = soft();
    this.#cast = soft();
    this.#ground = scene.add.graphics();
    this.#footL = part(art.foot, art.footOrigin);
    this.#footR = part(art.foot, art.footOrigin);
    this.#armL = part(art.arm, art.armOrigin);
    this.#armR = part(art.arm, art.armOrigin);
    this.#body = part(art.body, art.bodyOrigin);
    this.#face = part(art.face.NORMAL, art.faceOrigin);
    this.#rig = scene.add.container(0, 0, [
      this.#footL,
      this.#footR,
      this.#armL,
      this.#armR,
      this.#body,
      this.#face,
    ]);
    this.#name = scene.add
      .text(0, -92, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5, 1)
      .setStroke('#2d3466', 5)
      .setShadow(0, 2, '#1d2347', 4, true, true);
    this.#badges = scene.add.graphics();
    this.container = scene.add.container(0, 0, [
      this.#shadow,
      this.#cast,
      this.#ground,
      this.#rig,
      this.#name,
      this.#badges,
    ]);
    this.#footL.setPosition(-spec.footX, -3);
    this.#footR.setPosition(spec.footX, -3);
  }

  /** A THROW or SLASH the rules just resolved: a short wind-up or spin. */
  act(what: 'THROW' | 'SLASH', now: number): void {
    this.#action = what;
    this.#actionAt = now;
  }

  update(s: CharacterState, now: number): void {
    const spec = this.#art.spec;
    const dt = Math.min(64, now - this.#last || 16);
    this.#last = now;
    const moving = Math.min(1, s.speed / 320);
    this.#phase += (dt / 1000) * (7 + moving * 8) * (moving > 0.05 ? 1 : 0.35);
    const t = now / 1000;
    const since = now - this.#actionAt;

    // acceleration squash/stretch: a spring that kicks when the speed changes sharply
    if (s.speed - this.#lastSpeed > 90)
      this.#squash = -0.13; // starting: stretch
    else if (this.#lastSpeed - s.speed > 90) this.#squash = 0.15; // stopping: squash
    this.#lastSpeed = s.speed;
    this.#squash += (0 - this.#squash) * 0.2;

    // the face
    let mood: Mood = 'NORMAL';
    if (s.dead) mood = 'HIT';
    else if (s.victorious) mood = 'HAPPY';
    else if ((this.#action !== 'NONE' && since < 300) || s.dashing) mood = 'FIERCE';
    else if ((now + ((spec.eyeGap * 977) % 1700)) % 3900 < 130) mood = 'BLINK';
    if (mood !== this.#mood) {
      this.#mood = mood;
      this.#face.setTexture(this.#art.face[mood]);
    }

    // the body: lean into the movement, stride bounce, breathing, squash and stretch
    const hx = s.heading.x;
    const hy = s.heading.y;
    const breathe = Math.sin(t * 3.2 + spec.footX);
    let sx = 1 + 0.012 * breathe;
    let sy = 1 - 0.02 * breathe;
    let rot = hx * 0.2 * moving + Math.sin(this.#phase) * 0.07 * moving;
    let lift = Math.abs(Math.sin(this.#phase)) * 5.5 * moving;
    sy += (1 - Math.abs(Math.sin(this.#phase))) * -0.035 * moving + hy * 0.04 * moving;
    sx += -this.#squash * 0.5;
    sy += this.#squash;
    let spin = 1;
    if (s.dead) {
      sx = 1.3;
      sy = 0.34;
      rot = 0;
      lift = 0;
    } else if (s.victorious) {
      lift = Math.abs(Math.sin(t * 8)) * 26;
      sy = 1 + 0.1 * Math.sin(t * 16);
      rot = Math.sin(t * 8) * 0.12;
    } else if (s.dashing) {
      sx = 1.22;
      sy = 0.84;
      rot = hx * 0.38;
    } else if (this.#action === 'SLASH' && since < 320) {
      const p = since / 320;
      // wind up (a little back), then spin through a full turn: the body turns edge-on and round again
      if (p < 0.18) rot = -0.2 * Math.sign(s.facing.x || 1);
      else spin = Math.cos(((p - 0.18) / 0.82) * Math.PI * 2);
      sy = 1.05;
      lift = Math.sin(p * Math.PI) * 6;
    } else if (this.#action === 'THROW' && since < 280) {
      const p = since / 280;
      const swing = p < 0.3 ? -p / 0.3 : (p - 0.3) / 0.7;
      rot = -0.25 * swing * Math.sign(s.facing.x || 1);
      sy = 1 - 0.1 * Math.sin(p * Math.PI);
      sx = 1 + 0.08 * Math.sin(p * Math.PI);
    }
    const flipTarget = s.facing.x < -0.2 ? -1 : 1;
    this.#flip += (flipTarget - this.#flip) * 0.35;
    this.#rig.setScale(sx * (Math.abs(spin) < 0.12 ? 0.12 : spin), sy);
    this.#rig.setRotation(rot);
    this.#rig.setY(-lift);
    this.#body.setScale(this.#flip / SS, 1 / SS);
    this.#face.setPosition(s.facing.x * 3 * Math.abs(this.#flip), spec.faceY);
    this.#face.setVisible(spin > 0 || this.#action !== 'SLASH' || since >= 320);
    // limbs
    const stride = Math.sin(this.#phase) * 5.5 * moving;
    this.#footL.setPosition(-spec.footX, -3 + stride);
    this.#footR.setPosition(spec.footX, -3 - stride);
    const swing = Math.sin(this.#phase + Math.PI) * 4 * moving;
    const up = s.victorious ? -20 : 0;
    const throwArm =
      this.#action === 'THROW' && since < 280 ? -14 * Math.sin((since / 280) * Math.PI) : 0;
    this.#armL.setPosition(-spec.armX, spec.armY + swing + up * 0.3);
    this.#armR.setPosition(spec.armX, spec.armY - swing + up * 0.3 + throwArm);

    // placement
    this.container.setPosition(s.x, s.y).setScale(s.k);
    this.container.setAlpha(
      s.dimmed && !s.dead ? 0.45 : s.phasing === 'wall' ? 0.45 : s.phasing === 'open' ? 0.7 : 1,
    );
    this.screen = { x: s.x, y: s.y };
    this.box = { x0: s.x - 44 * s.k, y0: s.y - 100 * s.k, x1: s.x + 44 * s.k, y1: s.y + 8 * s.k };

    // the soft contact shadow, the cast shadow thrown to the lower right (smaller and fainter when they hop), the ring
    const rx = s.ringRx / s.k;
    const ry = s.ringRy / s.k;
    const air = Math.max(0.55, 1 - lift / 60);
    this.#shadow
      .setPosition(2, 3)
      .setDisplaySize(rx * 2.5 * air, ry * 2.6 * air)
      .setAlpha(s.dead ? 0.5 : 0.95);
    this.#cast
      .setPosition(rx * 0.5, ry * 0.45)
      .setDisplaySize(rx * 2.4 * air, ry * 1.4 * air)
      .setAlpha(0.32 * air)
      .setAngle(14);
    const g = this.#ground;
    g.clear();
    if (!s.dead) {
      g.lineStyle(4.5, s.color, 0.92);
      g.strokeEllipse(0, 0, rx * 2, ry * 2);
      g.lineStyle(1.8, 0xffffff, 0.55);
      g.strokeEllipse(0, 0, rx * 2 - 6, ry * 2 - 6);
      const fx = s.facing.x;
      const fy = s.facing.y;
      const tip = { x: fx * (rx + 18), y: fy * (ry + 18) };
      const base = { x: fx * (rx + 2), y: fy * (ry + 2) };
      const px = -fy * 7;
      const py = fx * 4.5;
      g.fillStyle(s.armed ? s.color : 0xffffff, s.armed ? 0.95 : 0.3);
      g.fillTriangle(base.x + px, base.y + py, base.x - px, base.y - py, tip.x, tip.y);
      if (!s.armed) {
        g.lineStyle(2, s.color, 0.8);
        g.strokeTriangle(base.x + px, base.y + py, base.x - px, base.y - py, tip.x, tip.y);
      }
      if (s.fatigued) {
        g.lineStyle(5, 0xffb020, 0.9);
        g.strokeEllipse(0, 0, rx * 2 + 14, ry * 2 + 14);
      }
      if (s.phasing !== 'none') {
        g.lineStyle(4, POWER_STYLE.PHASE_DASH.color, 0.9);
        g.strokeEllipse(0, 0, rx * 2 + 10, ry * 2 + 10);
      }
    }
    if (s.powers.includes('GUARD') && !s.dead) {
      g.fillStyle(POWER_STYLE.GUARD.color, 0.12);
      g.fillEllipse(0, -32, 96, 104);
      g.lineStyle(4, POWER_STYLE.GUARD.color, 0.9);
      g.strokeEllipse(0, -32, 96, 104);
      g.lineStyle(2, 0xffffff, 0.7);
      g.beginPath();
      g.arc(-6, -34, 44, Math.PI * 1.05, Math.PI * 1.45, false);
      g.strokePath();
    }
    if (s.fatigued && !s.dead) {
      g.fillStyle(0x9fd8ff, 0.95);
      for (const dx of [-14, 0, 14]) g.fillCircle(dx, -86 + ((t * 40 + dx) % 10), 3);
    }

    // the smear: a translucent streak behind a moving or dashing character, in its own colour
    this.#history.push({ x: s.x, y: s.y - 30 * s.k });
    if (this.#history.length > TRAIL) this.#history.shift();
    this.#drawTrail(s, moving);

    // the name and the power badges (small, restrained)
    const key = `${s.label}|${s.number}|${s.powers.join(',')}`;
    if (key !== this.#key) {
      this.#key = key;
      this.#name.setText(s.label);
      const b = this.#badges;
      b.clear();
      for (let i = 0; i < 3; i += 1) {
        const kind = s.powers[i];
        const bx = (i - 1) * 22;
        if (kind === undefined) {
          b.lineStyle(2, 0xffffff, 0.3);
          b.strokeCircle(bx, -112, 7);
        } else {
          b.fillStyle(0x1a1f3a, 0.8);
          b.fillCircle(bx, -112, 10);
          b.save();
          b.translateCanvas(bx, -112);
          drawGlyph(b, kind, 7);
          b.restore();
        }
      }
    }
    this.#name.setAlpha(s.dead ? 0.5 : 1);
    this.#trail.setDepth(this.container.depth - 0.1);
  }

  #drawTrail(s: CharacterState, moving: number): void {
    const g = this.#trail;
    g.clear();
    const strength = s.dashing ? 1 : Math.min(1, Math.max(0, (moving - 0.35) / 0.65)) * 0.65;
    if (strength <= 0.02 || s.dead) return;
    const n = this.#history.length;
    if (n < 3) return;
    for (let i = 0; i < n - 1; i += 1) {
      const a = this.#history[i] as { x: number; y: number };
      const b = this.#history[i + 1] as { x: number; y: number };
      const t = (i + 1) / n;
      const w = (this.#art.spec.width * 0.42 + 8) * s.k * (0.25 + 0.75 * t);
      g.lineStyle(w, this.#art.spec.base, 0.3 * t * t * strength);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  destroy(): void {
    this.#trail.destroy();
    this.container.destroy();
  }
}
