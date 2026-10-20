import * as Phaser from 'phaser';
import type { PowerKind } from '@foomerang/foomerang-fu';
import type { ViewEvent } from '../viewModel';

/**
 * The look of the one-shot effects (a throw's ring, a hit's flash, a clank, a blast, a shield breaking...) and of the powers,
 * shared by every arena the console can draw. Presentation only: derived from view events, timed by Phaser's clock, never
 * read back by the rules.
 */

export const OUTLINE = 0xffffff;
/** How long the burst at the start of a dash is on screen. */
const DASH_BURST_MS = 300;
/** How long the swoosh is on screen: the sweep, then a fade. A look, not a rule. */
const SWOOSH_MS = 240;
/** How long a deflection's CLANK is on screen. A look, not a rule. */
const DEFLECT_MS = 380;

export const toNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

/** Each powerup has its own colour, glyph and word, so no two are ever confused. Original placeholders. */
export const POWER_STYLE: Readonly<
  Record<PowerKind, { readonly color: number; readonly label: string }>
> = {
  CAFFEINATED: { color: 0xffd23f, label: 'CAFFEINATED' },
  EXPLOSIVE_BOOMERANG: { color: 0xff5a36, label: 'EXPLOSIVE' },
  SHIELD: { color: 0x4fd8ff, label: 'SHIELD' },
  EXTRA_BOOMERANG: { color: 0x9d9a9b, label: 'EXTRA' },
};
/** What each power is called on screen. (SHIELD is shown as SHIELD: it is a one-hit shield.) */
export const POWER_NAME: Readonly<Record<PowerKind, string>> = {
  CAFFEINATED: 'CAFFEINATED',
  EXPLOSIVE_BOOMERANG: 'EXPLOSIVE BOOMERANG',
  SHIELD: 'SHIELD',
  EXTRA_BOOMERANG: 'EXTRA BOOMERANG',
};

/** A powerup's glyph, centred on (0, 0), about `r` across. */
export function drawGlyph(g: Phaser.GameObjects.Graphics, kind: PowerKind, r: number): void {
  const { color } = POWER_STYLE[kind];
  const V = (x: number, y: number) => new Phaser.Math.Vector2(x * r, y * r);
  g.fillStyle(color, 1);
  g.lineStyle(Math.max(2, r * 0.22), color, 1);
  switch (kind) {
    case 'CAFFEINATED': // a lightning bolt
      g.fillPoints(
        [V(0.2, -1), V(-0.6, 0.1), V(-0.05, 0.1), V(-0.3, 1), V(0.6, -0.15), V(0.05, -0.15)],
        true,
      );
      break;
    case 'EXPLOSIVE_BOOMERANG': {
      // a spiky burst
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 16; i += 1) {
        const a = (Math.PI / 8) * i;
        pts.push(V(Math.cos(a) * (i % 2 === 0 ? 1 : 0.45), Math.sin(a) * (i % 2 === 0 ? 1 : 0.45)));
      }
      g.fillPoints(pts, true);
      break;
    }
    case 'SHIELD': // a ring round a core
      g.strokeCircle(0, 0, r * 0.85);
      g.fillCircle(0, 0, r * 0.4);
      break;
    case 'EXTRA_BOOMERANG': // two chevrons (the Phaser dev view)
      g.lineBetween(-0.9 * r, -0.7 * r, -0.2 * r, 0);
      g.lineBetween(-0.2 * r, 0, -0.9 * r, 0.7 * r);
      g.lineBetween(0.1 * r, -0.7 * r, 0.8 * r, 0);
      g.lineBetween(0.8 * r, 0, 0.1 * r, 0.7 * r);
      break;
  }
}

/** The drawing calls an effect uses: a Phaser Graphics fits, and so does a map's projected ground pen. */
export interface Pen {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  strokeCircle(x: number, y: number, radius: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  arc(
    x: number,
    y: number,
    radius: number,
    start: number,
    end: number,
    anticlockwise?: boolean,
  ): unknown;
  closePath(): unknown;
  fillPath(): unknown;
  strokePath(): unknown;
  destroy(): unknown;
}

/** Where an effect draws: its pen, and where a point of the ground is on screen (for text). */
export interface EffectTarget {
  readonly pen: Pen;
  readonly at: (x: number, y: number) => { readonly x: number; readonly y: number };
}

export interface Effect {
  readonly graphics: Pen;
  /** A text announcement that lives and dies with the effect. */
  readonly extra?: Phaser.GameObjects.Text;
  readonly born: number;
  readonly duration: number;
  readonly update: (g: Pen, progress: number) => void;
}

/**
 * Brief feedback at the place something happened. Everything is drawn through a PEN, so the same effects serve the flat
 * primitive arenas (the pen is a Phaser Graphics) and the maps (the pen projects the ground plane through the map's camera).
 */
export function spawnEffect(
  scene: Phaser.Scene,
  event: ViewEvent,
  effects: Effect[],
  target: EffectTarget,
): void {
  const color = toNumber(event.color);
  const { pen: graphics } = target;
  const at = target.at(event.x, event.y);
  const born = scene.time.now;
  const ring =
    (radiusFrom: number, radiusTo: number, width: number) => (g: Pen, progress: number) => {
      g.clear();
      g.lineStyle(width * (1 - progress) + 1, color, 1 - progress);
      g.strokeCircle(event.x, event.y, radiusFrom + (radiusTo - radiusFrom) * progress);
    };
  switch (event.type) {
    case 'THROWN':
      effects.push({ graphics, born, duration: 260, update: ring(20, 62, 6) });
      break;
    case 'CAUGHT':
      effects.push({ graphics, born, duration: 220, update: ring(60, 24, 6) });
      break;
    case 'HIT':
      effects.push({
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
    case 'DEFLECTED': {
      // CLANK: a white burst, spokes, a ring in the defender's colour, and a streak the way it was sent.
      const knock = event.knock ?? { x: 1, y: 0 };
      effects.push({
        graphics,
        born,
        duration: DEFLECT_MS,
        update: (g, progress) => {
          g.clear();
          const fade = 1 - progress;
          g.fillStyle(0xffffff, 0.9 * fade * fade);
          g.fillCircle(event.x, event.y, 26 + progress * 46);
          g.lineStyle(7 * fade + 1, 0xffffff, fade);
          for (let i = 0; i < 8; i += 1) {
            const a = (Math.PI / 4) * i + 0.2;
            const r0 = 30 + progress * 30;
            const r1 = 56 + progress * 80;
            g.lineBetween(
              event.x + Math.cos(a) * r0,
              event.y + Math.sin(a) * r0,
              event.x + Math.cos(a) * r1,
              event.y + Math.sin(a) * r1,
            );
          }
          g.lineStyle(12 * fade + 2, color, fade);
          g.strokeCircle(event.x, event.y, 28 + progress * 110);
          // the way it went: a bright streak from the point of impact
          g.lineStyle(14 * fade + 2, 0xffffff, 0.95 * fade);
          g.lineBetween(
            event.x,
            event.y,
            event.x + knock.x * (40 + progress * 170),
            event.y + knock.y * (40 + progress * 170),
          );
        },
      });
      break;
    }
    case 'DASHED': {
      // A burst where it began: a ring and a few speed lines trailing back, away from the way it went.
      const way = event.direction ?? { x: 1, y: 0 };
      const burst = color;
      effects.push({
        graphics,
        born,
        duration: DASH_BURST_MS,
        update: (g, progress) => {
          g.clear();
          const fade = 1 - progress;
          g.lineStyle(8 * fade + 1, burst, fade);
          g.strokeCircle(event.x, event.y, 30 + progress * 60);
          g.lineStyle(6 * fade + 1, 0xffffff, 0.9 * fade);
          for (const offset of [-0.35, 0, 0.35]) {
            const angle = Math.atan2(-way.y, -way.x) + offset;
            g.lineBetween(
              event.x + Math.cos(angle) * 40,
              event.y + Math.sin(angle) * 40,
              event.x + Math.cos(angle) * (70 + progress * 110),
              event.y + Math.sin(angle) * (70 + progress * 110),
            );
          }
        },
      });
      break;
    }
    case 'SPAWNED':
      effects.push({ graphics, born, duration: 420, update: ring(70, 20, 7) });
      break;
    case 'PICKUP': {
      // taken: a ring in the power's own colour (and the player's) closing on the player
      const power = POWER_STYLE[event.kind ?? 'SHIELD'].color;
      const named = POWER_NAME[event.kind ?? 'SHIELD'];
      const reveal = scene.add
        .text(at.x, at.y - 110, `${event.who ?? 'PLAYER'} GOT ${named}!`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '40px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 8,
        })
        .setOrigin(0.5)
        .setDepth(12);
      effects.push({
        graphics,
        extra: reveal,
        born,
        duration: 1800,
        update: (g, progress) => {
          g.clear();
          const fade = Math.max(0, 1 - progress * 3);
          g.lineStyle(12 * fade + 2, power, fade);
          g.strokeCircle(event.x, event.y, 120 - progress * 80);
          g.lineStyle(5 * fade + 1, color, fade);
          g.strokeCircle(event.x, event.y, 150 - progress * 90);
        },
      });
      break;
    }
    case 'POWER_LOST': {
      // a power leaving the inventory: pushed out by a newer one (red) or a shield that broke (cyan)
      const broke = event.reason === 'SHIELD_BROKEN';
      const note = scene.add
        .text(
          at.x,
          at.y - 80,
          broke
            ? `${event.who ?? ''} SHIELD BROKE`
            : `${POWER_NAME[event.kind ?? 'SHIELD']} REPLACED`,
          {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '30px',
            fontStyle: 'bold',
            color: broke ? '#4fd8ff' : '#ff8a80',
            stroke: '#000000',
            strokeThickness: 6,
          },
        )
        .setOrigin(0.5)
        .setDepth(12);
      effects.push({
        graphics,
        extra: note,
        born,
        duration: 1500,
        update: (g, progress) => {
          g.clear();
          g.lineStyle(
            8 * (1 - progress) + 1,
            broke ? POWER_STYLE.SHIELD.color : 0xff5a5a,
            1 - progress,
          );
          g.strokeCircle(event.x, event.y, 40 + progress * 70);
        },
      });
      break;
    }
    case 'BLASTED': {
      // the explosion, to exactly the radius the rules resolved: a flash, then the edge of the blast
      const radius = event.radius ?? 170;
      const fire = POWER_STYLE.EXPLOSIVE_BOOMERANG.color;
      effects.push({
        graphics,
        born,
        duration: 560,
        update: (g, progress) => {
          g.clear();
          const fade = 1 - progress;
          const reach = radius * Math.min(1, progress * 3);
          g.fillStyle(fire, 0.45 * fade);
          g.fillCircle(event.x, event.y, reach);
          g.fillStyle(0xffffff, 0.8 * fade * fade);
          g.fillCircle(event.x, event.y, 40 + progress * 40);
          g.lineStyle(10 * fade + 2, fire, fade);
          g.strokeCircle(event.x, event.y, reach);
          g.lineStyle(4, color, fade);
          g.strokeCircle(event.x, event.y, radius);
        },
      });
      break;
    }
    case 'SHIELD_BLOCKED': {
      // the guard shatters: spokes flying outward in its own cyan
      const guard = POWER_STYLE.SHIELD.color;
      effects.push({
        graphics,
        born,
        duration: 440,
        update: (g, progress) => {
          g.clear();
          const fade = 1 - progress;
          g.lineStyle(10 * fade + 2, guard, fade);
          g.strokeCircle(event.x, event.y, 46 + progress * 50);
          g.lineStyle(7 * fade + 1, 0xffffff, fade);
          for (let i = 0; i < 6; i += 1) {
            const a = (Math.PI / 3) * i + 0.3;
            g.lineBetween(
              event.x + Math.cos(a) * (50 + progress * 40),
              event.y + Math.sin(a) * (50 + progress * 40),
              event.x + Math.cos(a) * (80 + progress * 90),
              event.y + Math.sin(a) * (80 + progress * 90),
            );
          }
        },
      });
      break;
    }
    case 'FATIGUED': {
      // Becoming tired: an amber ring that collapses onto the player, then the persistent tired ring stays.
      effects.push({
        graphics,
        born,
        duration: 520,
        update: (g, progress) => {
          g.clear();
          g.lineStyle(14 * (1 - progress) + 2, 0xffb020, 1 - progress);
          g.strokeCircle(event.x, event.y, 150 - progress * 100);
          g.lineStyle(6 * (1 - progress) + 1, 0x9fd8ff, 1 - progress);
          for (const dx of [-30, 0, 30]) {
            g.lineBetween(event.x + dx, event.y - 70, event.x + dx, event.y - 70 + progress * 60);
          }
        },
      });
      break;
    }
    case 'RECOVERED':
      // Full mobility is back: a bright green flash and a ring that opens outward.
      effects.push({
        graphics,
        born,
        duration: 560,
        update: (g, progress) => {
          g.clear();
          const fade = 1 - progress;
          g.fillStyle(0x7dff9b, 0.6 * fade * fade);
          g.fillCircle(event.x, event.y, 40 + progress * 40);
          g.lineStyle(12 * fade + 2, 0x7dff9b, fade);
          g.strokeCircle(event.x, event.y, 50 + progress * 110);
        },
      });
      break;
    case 'SLASHED':
      if (event.swing !== undefined) {
        effects.push({
          graphics,
          born,
          duration: SWOOSH_MS,
          update: swoosh(event, event.swing, color),
        });
      } else graphics.destroy();
      break;
    case 'ROUND_START':
      effects.push({ graphics, born, duration: 650, update: ring(40, 520, 10) });
      break;
  }
}

/**
 * The slash: a wedge exactly as wide and as long as the rules' hit region (they hand us the reach
 * and arc), swept open in the facing direction and then faded. It is drawn FROM the swing the rules
 * resolved; it decides nothing.
 */
function swoosh(
  event: ViewEvent,
  swing: NonNullable<ViewEvent['swing']>,
  color: number,
): Effect['update'] {
  const centre = Math.atan2(swing.direction.y, swing.direction.x);
  const start = centre - swing.arc / 2;
  return (g, progress) => {
    g.clear();
    const sweep = Math.min(1, progress / 0.4); // the blade crosses the arc, then lingers and fades
    const end = start + swing.arc * sweep;
    const fade = progress < 0.4 ? 1 : 1 - (progress - 0.4) / 0.6;
    g.fillStyle(color, 0.5 * fade);
    g.lineStyle(14, OUTLINE, 0.95 * fade);
    g.beginPath();
    g.moveTo(event.x, event.y);
    g.arc(event.x, event.y, swing.reach, start, end, false);
    g.closePath();
    g.fillPath();
    g.beginPath();
    g.arc(event.x, event.y, swing.reach, start, end, false);
    g.strokePath();
    // the leading edge: a bright line from the player out to the tip of the blade
    g.lineStyle(8, color, fade);
    g.lineBetween(
      event.x,
      event.y,
      event.x + Math.cos(end) * swing.reach,
      event.y + Math.sin(end) * swing.reach,
    );
  };
}
