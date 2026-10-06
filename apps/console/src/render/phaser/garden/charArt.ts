import * as Phaser from 'phaser';
import {
  hex,
  lighten,
  makeCanvas,
  mixColor,
  roundedPath,
  shade,
  softShadow,
  type Ctx,
  type P,
} from './paint';

/**
 * The four characters, painted as the reference video paints its cast: soft plush/clay volumes, a matte material with a small
 * specular glint, a warm bounce of light from the floor, a cool darker underside; big round glossy black eyes with a white
 * highlight, a thin one-line smile, stubby tube limbs and feet in a darker shade of the body colour. Baked once (at twice
 * the size they are shown, so they stay soft when scaled down) into textures; the animation is Phaser transforms.
 *
 * Which one a player is is cosmetic. Every one is the same gameplay body; nothing here is read by the rules.
 */
export type CharacterKind = 'BREAD' | 'COFFEE' | 'PUMPKIN' | 'FRUIT';
export type Mood = 'NORMAL' | 'BLINK' | 'HAPPY' | 'HIT' | 'FIERCE';
export const MOODS: readonly Mood[] = ['NORMAL', 'BLINK', 'HAPPY', 'HIT', 'FIERCE'];

/** Bake resolution multiplier: textures are drawn at this size and displayed at 1 / SS. */
export const SS = 2;

const EYE = 0x1d1822;
const BLUSH = 0xff8fa0;

interface Spec {
  readonly base: number;
  readonly width: number;
  readonly height: number;
  /** Where the face sits, relative to the feet (px at scale 1; y negative = up). */
  readonly faceY: number;
  readonly eyeGap: number;
  readonly eyeSize: number;
  readonly limb: number;
  readonly armY: number;
  readonly armX: number;
  readonly footX: number;
}

export const SPECS: Readonly<Record<CharacterKind, Spec>> = {
  BREAD: {
    base: 0xeec47a,
    width: 62,
    height: 66,
    faceY: -40,
    eyeGap: 12,
    eyeSize: 5.4,
    limb: 0xb98a4e,
    armY: -30,
    armX: 33,
    footX: 12,
  },
  COFFEE: {
    base: 0xf4f5fa,
    width: 58,
    height: 62,
    faceY: -34,
    eyeGap: 11,
    eyeSize: 5.2,
    limb: 0xb08968,
    armY: -28,
    armX: 33,
    footX: 11,
  },
  PUMPKIN: {
    base: 0xf08a24,
    width: 66,
    height: 64,
    faceY: -30,
    eyeGap: 12,
    eyeSize: 5.4,
    limb: 0x5f8c3a,
    armY: -28,
    armX: 35,
    footX: 12,
  },
  FRUIT: {
    base: 0xa9dc7d,
    width: 62,
    height: 58,
    faceY: -31,
    eyeGap: 12,
    eyeSize: 5.6,
    limb: 0x7ea853,
    armY: -26,
    armX: 34,
    footX: 12,
  },
};

interface Baked {
  readonly canvas: HTMLCanvasElement;
  /** Where (0, 0) — the feet — sits inside the canvas, in canvas pixels. */
  readonly ox: number;
  readonly oy: number;
}

const PAD = 14;

function volume(ctx: Ctx, base: number, cx: number, cy: number, rx: number, ry: number): void {
  // light from the upper left: bright top-left, base mid, a cooler, deeper underside to the lower right
  const g = ctx.createRadialGradient(
    cx - rx * 0.38,
    cy - ry * 0.5,
    Math.min(rx, ry) * 0.12,
    cx,
    cy,
    Math.max(rx, ry) * 1.15,
  );
  g.addColorStop(0, hex(lighten(base, 0.45)));
  g.addColorStop(0.42, hex(base));
  g.addColorStop(1, hex(mixColor(shade(base, 0.62), 0x5a4a8a, 0.18)));
  ctx.fillStyle = g;
  ctx.fill();
}

function finishVolume(
  ctx: Ctx,
  base: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  ctx.save();
  ctx.clip();
  // a warm bounce of light from the floor along the bottom edge
  const bounce = ctx.createLinearGradient(0, cy + ry * 0.35, 0, cy + ry);
  bounce.addColorStop(0, 'rgba(255,214,140,0)');
  bounce.addColorStop(1, 'rgba(255,214,140,0.30)');
  ctx.fillStyle = bounce;
  ctx.fillRect(cx - rx - 4, cy, rx * 2 + 8, ry + 6);
  // a small soft specular glint on the lit shoulder
  const spec = ctx.createRadialGradient(
    cx - rx * 0.42,
    cy - ry * 0.55,
    0,
    cx - rx * 0.42,
    cy - ry * 0.55,
    rx * 0.42,
  );
  spec.addColorStop(0, 'rgba(255,255,255,0.62)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
  ctx.restore();
  void base;
}

function bakeBread(spec: Spec): Baked {
  const s = SS;
  const w = spec.width;
  const h = spec.height;
  const { canvas, ctx } = makeCanvas((w + PAD * 2) * s, (h + PAD * 2) * s);
  ctx.scale(s, s);
  ctx.translate(PAD + w / 2, PAD + h);
  // the crust: a darker golden rim around the slice, with the two soft bumps on top
  const outline: P[] = [
    { x: -w * 0.5, y: -h * 0.05 },
    { x: -w * 0.52, y: -h * 0.68 },
    { x: -w * 0.4, y: -h * 0.97 },
    { x: -w * 0.12, y: -h * 0.88 },
    { x: w * 0.12, y: -h * 0.88 },
    { x: w * 0.4, y: -h * 0.97 },
    { x: w * 0.52, y: -h * 0.68 },
    { x: w * 0.5, y: -h * 0.05 },
    { x: w * 0.3, y: h * 0.0 },
    { x: -w * 0.3, y: h * 0.0 },
  ];
  roundedPath(ctx, outline, 0.4);
  volume(ctx, 0xc98f48, 0, -h * 0.5, w * 0.5, h * 0.5);
  finishVolume(ctx, 0xc98f48, 0, -h * 0.5, w * 0.5, h * 0.5);
  // the crumb: the pale soft face of the slice
  const crumb = outline.map((p) => ({ x: p.x * 0.8 + 0, y: (p.y + h * 0.5) * 0.82 - h * 0.46 }));
  roundedPath(ctx, crumb, 0.4);
  volume(ctx, 0xf7dca4, 0, -h * 0.5, w * 0.4, h * 0.42);
  finishVolume(ctx, 0xf7dca4, 0, -h * 0.5, w * 0.4, h * 0.42);
  ctx.fillStyle = 'rgba(190,140,80,0.22)';
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.ellipse(
      -w * 0.28 + (i % 4) * w * 0.18,
      -h * 0.78 + Math.floor(i / 4) * h * 0.4 + (i % 2) * 4,
      1.8,
      1.2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  return { canvas, ox: (PAD + w / 2) * s, oy: (PAD + h) * s };
}

function bakeCoffee(spec: Spec): Baked {
  const s = SS;
  const w = spec.width;
  const h = spec.height;
  const { canvas, ctx } = makeCanvas((w + PAD * 2 + 20) * s, (h + PAD * 2) * s);
  ctx.scale(s, s);
  ctx.translate(PAD + 10 + w / 2, PAD + h);
  // the handle, a soft ring behind the cup
  ctx.lineWidth = 8;
  const hg = ctx.createLinearGradient(-w * 0.8, 0, -w * 0.4, 0);
  hg.addColorStop(0, 'rgba(255,255,255,1)');
  hg.addColorStop(1, 'rgba(200,205,225,1)');
  ctx.strokeStyle = hg;
  ctx.beginPath();
  ctx.ellipse(-w * 0.56, -h * 0.5, 11, 15, 0, 0, Math.PI * 2);
  ctx.stroke();
  // the body of the cup: a rounded white cylinder, cool shadow on the right
  const body: P[] = [
    { x: -w * 0.46, y: -h * 0.78 },
    { x: w * 0.46, y: -h * 0.78 },
    { x: w * 0.44, y: -h * 0.06 },
    { x: -w * 0.44, y: -h * 0.06 },
  ];
  roundedPath(ctx, body, 0.28);
  volume(ctx, 0xf6f7fc, 0, -h * 0.42, w * 0.46, h * 0.42);
  finishVolume(ctx, 0xf6f7fc, 0, -h * 0.42, w * 0.46, h * 0.42);
  // the rim and the coffee inside
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.8, w * 0.5, h * 0.2, 0, 0, Math.PI * 2);
  const rim = ctx.createLinearGradient(-w * 0.5, -h, w * 0.5, -h * 0.6);
  rim.addColorStop(0, 'rgba(255,255,255,1)');
  rim.addColorStop(1, 'rgba(218,222,238,1)');
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.8, w * 0.4, h * 0.14, 0, 0, Math.PI * 2);
  const coffee = ctx.createLinearGradient(0, -h * 0.94, 0, -h * 0.66);
  coffee.addColorStop(0, hex(0x40220f));
  coffee.addColorStop(1, hex(0x7a4628));
  ctx.fillStyle = coffee;
  ctx.fill();
  ctx.fillStyle = 'rgba(210,160,110,0.55)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.1, -h * 0.84, w * 0.14, h * 0.04, -0.3, 0, Math.PI * 2);
  ctx.fill();
  return { canvas, ox: (PAD + 10 + w / 2) * s, oy: (PAD + h) * s };
}

function bakePumpkin(spec: Spec): Baked {
  const s = SS;
  const w = spec.width;
  const h = spec.height;
  const { canvas, ctx } = makeCanvas((w + PAD * 2) * s, (h + PAD * 2 + 14) * s);
  ctx.scale(s, s);
  ctx.translate(PAD + w / 2, PAD + 14 + h);
  // the body: a squat sphere made of soft lobes
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.5, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  volume(ctx, spec.base, 0, -h * 0.5, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.5, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  finishVolume(ctx, spec.base, 0, -h * 0.5, w * 0.5, h * 0.5);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.5, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(176,86,10,0.45)';
  ctx.lineWidth = 3;
  for (const k of [-0.62, -0.3, 0.3, 0.62]) {
    ctx.beginPath();
    ctx.ellipse(
      0,
      -h * 0.5,
      w * 0.5 * Math.abs(k) + 3,
      h * 0.5,
      0,
      Math.PI * 0.5,
      Math.PI * 1.5,
      k < 0,
    );
    ctx.stroke();
  }
  ctx.restore();
  // stem and leaf
  ctx.fillStyle = hex(0x6b5a2a);
  roundedPath(
    ctx,
    [
      { x: -4, y: -h * 0.98 },
      { x: 4, y: -h * 0.98 },
      { x: 5, y: -h * 0.86 },
      { x: -5, y: -h * 0.86 },
    ],
    0.3,
  );
  ctx.fill();
  const leaf = ctx.createLinearGradient(0, -h * 1.1, 24, -h * 0.9);
  leaf.addColorStop(0, hex(0x7fcb55));
  leaf.addColorStop(1, hex(0x3f8a3b));
  ctx.fillStyle = leaf;
  ctx.beginPath();
  ctx.moveTo(2, -h * 0.9);
  ctx.quadraticCurveTo(14, -h * 1.12, 28, -h * 1.0);
  ctx.quadraticCurveTo(18, -h * 0.84, 2, -h * 0.9);
  ctx.fill();
  return { canvas, ox: (PAD + w / 2) * s, oy: (PAD + 14 + h) * s };
}

function bakeFruit(spec: Spec): Baked {
  const s = SS;
  const w = spec.width;
  const h = spec.height;
  const { canvas, ctx } = makeCanvas((w + PAD * 2) * s, (h + PAD * 2 + 16) * s);
  ctx.scale(s, s);
  ctx.translate(PAD + w / 2, PAD + 16 + h);
  // a soft pear/apple ovoid
  const outline: P[] = [
    { x: -w * 0.18, y: -h * 0.98 },
    { x: w * 0.18, y: -h * 0.98 },
    { x: w * 0.5, y: -h * 0.5 },
    { x: w * 0.42, y: -h * 0.06 },
    { x: -w * 0.42, y: -h * 0.06 },
    { x: -w * 0.5, y: -h * 0.5 },
  ];
  roundedPath(ctx, outline, 0.46);
  volume(ctx, spec.base, 0, -h * 0.5, w * 0.5, h * 0.5);
  roundedPath(ctx, outline, 0.46);
  finishVolume(ctx, spec.base, 0, -h * 0.5, w * 0.5, h * 0.5);
  // the stem and its two leaves
  ctx.fillStyle = hex(0x7a5a3a);
  roundedPath(
    ctx,
    [
      { x: -2.4, y: -h * 1.08 },
      { x: 2.4, y: -h * 1.08 },
      { x: 2.8, y: -h * 0.94 },
      { x: -2.8, y: -h * 0.94 },
    ],
    0.3,
  );
  ctx.fill();
  for (const dir of [-1, 1]) {
    const g = ctx.createLinearGradient(0, -h * 1.1, dir * 26, -h * 1.0);
    g.addColorStop(0, hex(0x6cb843));
    g.addColorStop(1, hex(0x9bd566));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(dir * 2, -h * 1.02);
    ctx.quadraticCurveTo(dir * 14, -h * 1.22, dir * 28, -h * 1.06);
    ctx.quadraticCurveTo(dir * 14, -h * 0.94, dir * 2, -h * 1.02);
    ctx.fill();
  }
  return { canvas, ox: (PAD + w / 2) * s, oy: (PAD + 16 + h) * s };
}

const BODY: Readonly<Record<CharacterKind, (spec: Spec) => Baked>> = {
  BREAD: bakeBread,
  COFFEE: bakeCoffee,
  PUMPKIN: bakePumpkin,
  FRUIT: bakeFruit,
};

/** Glossy black eyes with a big and a small white highlight, blush, and a thin mouth: the cast's shared face language. */
function bakeFace(kind: CharacterKind, mood: Mood): Baked {
  const spec = SPECS[kind];
  const s = SS;
  const W = 80;
  const H = 50;
  const { canvas, ctx } = makeCanvas(W * s, H * s);
  ctx.scale(s, s);
  ctx.translate(W / 2, H / 2);
  const gap = spec.eyeGap;
  const e = spec.eyeSize;
  ctx.fillStyle = hex(BLUSH, 0.5);
  for (const dx of [-1, 1]) {
    softShadow(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(dx * (gap + 10), 7, 6.5, 3.8, 0, 0, Math.PI * 2);
      },
      hex(BLUSH, 0.55),
      4,
    );
  }
  ctx.lineCap = 'round';
  for (const dx of [-1, 1]) {
    const x = dx * gap;
    if (mood === 'HIT') {
      ctx.strokeStyle = hex(EYE);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - e * 0.8, -e * 0.8);
      ctx.lineTo(x + e * 0.8, e * 0.8);
      ctx.moveTo(x + e * 0.8, -e * 0.8);
      ctx.lineTo(x - e * 0.8, e * 0.8);
      ctx.stroke();
    } else if (mood === 'HAPPY') {
      ctx.strokeStyle = hex(EYE);
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(x, 1.5, e * 0.85, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    } else if (mood === 'BLINK') {
      ctx.strokeStyle = hex(EYE);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - e * 0.9, 0);
      ctx.lineTo(x + e * 0.9, 0);
      ctx.stroke();
    } else {
      const ry = mood === 'FIERCE' ? e * 0.78 : e * 1.08;
      const g = ctx.createRadialGradient(x - e * 0.3, -ry * 0.3, 0, x, 0, e * 1.1);
      g.addColorStop(0, hex(0x3a3344));
      g.addColorStop(0.6, hex(EYE));
      g.addColorStop(1, hex(0x0c0a10));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, 0, e, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.beginPath();
      ctx.ellipse(x - e * 0.32, -ry * 0.38, e * 0.36, e * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + e * 0.4, ry * 0.4, e * 0.17, 0, Math.PI * 2);
      ctx.fill();
      if (mood === 'FIERCE') {
        ctx.strokeStyle = hex(EYE);
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(x - dx * e * 1.4, -ry - 3.5);
        ctx.lineTo(x + dx * e * 1.0, -ry - 0.5);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = hex(0x5a3a3a);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  if (mood === 'HIT') ctx.ellipse(0, 12, 3, 4, 0, 0, Math.PI * 2);
  else if (mood === 'FIERCE') {
    ctx.moveTo(-5, 11);
    ctx.lineTo(5, 11);
  } else if (mood === 'HAPPY') {
    ctx.moveTo(-7, 8);
    ctx.quadraticCurveTo(0, 18, 7, 8);
  } else {
    ctx.moveTo(-5, 9);
    ctx.quadraticCurveTo(0, 14, 5, 9);
  }
  ctx.stroke();
  return { canvas, ox: (W / 2) * s, oy: (H / 2) * s };
}

function bakeLimb(kind: CharacterKind, w: number, h: number): Baked {
  const spec = SPECS[kind];
  const s = SS;
  const { canvas, ctx } = makeCanvas((w + 8) * s, (h + 8) * s);
  ctx.scale(s, s);
  ctx.translate(4 + w / 2, 4 + h / 2);
  roundedPath(
    ctx,
    [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 },
    ],
    0.45,
  );
  volume(ctx, spec.limb, 0, 0, w / 2, h / 2);
  return { canvas, ox: (4 + w / 2) * s, oy: (4 + h / 2) * s };
}

/** A soft round contact shadow, bright at the middle: one texture serves every shadow under every creature and boomerang. */
function bakeShadow(): Baked {
  const { canvas, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  g.addColorStop(0, 'rgba(34,52,62,0.62)');
  g.addColorStop(0.55, 'rgba(34,52,62,0.34)');
  g.addColorStop(1, 'rgba(34,52,62,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return { canvas, ox: 64, oy: 64 };
}

export interface CharacterArt {
  readonly body: string;
  readonly face: Readonly<Record<Mood, string>>;
  readonly arm: string;
  readonly foot: string;
  readonly spec: Spec;
  readonly bodyOrigin: { x: number; y: number };
  readonly faceOrigin: { x: number; y: number };
  readonly armOrigin: { x: number; y: number };
  readonly footOrigin: { x: number; y: number };
}

/** Bakes (once per scene) and returns the texture keys. */
export function bakeCharacters(scene: Phaser.Scene): {
  art: Readonly<Record<CharacterKind, CharacterArt>>;
  shadow: string;
} {
  const add = (key: string, b: Baked): void => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, b.canvas);
  };
  add('char-shadow', bakeShadow());
  const out = {} as Record<CharacterKind, CharacterArt>;
  for (const kind of Object.keys(SPECS) as CharacterKind[]) {
    const spec = SPECS[kind];
    const body = BODY[kind](spec);
    add(`char-${kind}-body`, body);
    const face = {} as Record<Mood, string>;
    let faceOrigin = { x: 0, y: 0 };
    for (const mood of MOODS) {
      const f = bakeFace(kind, mood);
      add(`char-${kind}-face-${mood}`, f);
      face[mood] = `char-${kind}-face-${mood}`;
      faceOrigin = { x: f.ox, y: f.oy };
    }
    const arm = bakeLimb(kind, 11, 13);
    add(`char-${kind}-arm`, arm);
    const foot = bakeLimb(kind, 15, 10);
    add(`char-${kind}-foot`, foot);
    out[kind] = {
      body: `char-${kind}-body`,
      face,
      arm: `char-${kind}-arm`,
      foot: `char-${kind}-foot`,
      spec,
      bodyOrigin: { x: body.ox, y: body.oy },
      faceOrigin,
      armOrigin: { x: arm.ox, y: arm.oy },
      footOrigin: { x: foot.ox, y: foot.oy },
    };
  }
  return { art: out, shadow: 'char-shadow' };
}
