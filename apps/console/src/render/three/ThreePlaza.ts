import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ArenaRenderer, DrawnCircle } from '../renderer';
import type { ArenaView, BoomerangView, CircleView, ViewEvent, WallView } from '../viewModel';
import { parseMapCamera, type MapCameraConfig } from '../reconstructed/mapCamera';
import { parseMapLayers } from '../reconstructed/mapLayers';
import { CHARACTER_COLOURS } from '../reconstructed/characterColours';
import {
  characterOf,
  headingFrame,
  type PackCharacter,
  type ReconstructedMap,
} from '../reconstructed/maps';
import { AimLine, Trail } from './chargeVisuals';
import { CALL_AURA, auraPulse } from '../callAura';
import { landingPose, type LandingPose } from '../roundIntro';
import { deathOf } from '../deathMotion';
import { Blasts } from './blasts';
import { PickupBadges } from './pickupBadges';
import { POWER_BADGE } from '../powerBadge';
import { DeathRemains, type Victim } from './deathRemains';
import { CHARACTER_RENDER_ORDER, plazaFloor } from './plazaFloor';
import { batchPlaza } from './plazaBatch';
import { PlazaProps } from './plazaProps';
import { characterHeight, sceneSpace } from './plazaSpace';

/**
 * The market plaza in real-time 3D. Everything in it is ours: the plaza's models with their own materials, a sun that casts
 * real shadows, our floor (art/reconstruction/environ2/blender/plaza_lit.py -> plaza.glb), seen through environ2's camera.
 * Players are the pack characters (their 16-heading atlases) standing IN the scene, so a stall really hides who is behind it;
 * a tall object in front of a living player turns see-through. The renderer only draws the authoritative view: it never steps
 * the simulation and never invents a position.
 */

const CANVAS = { width: 1920, height: 1080 } as const;
const BOOMERANG_HEIGHT = 24;
/** A character fills about this much of its atlas cell's height (the rest is room for its pose). */
const BODY_OF_CELL = 0.32;
/** How far (scene units) the camera may slide sideways to follow a player out onto the sand beyond the dashed lines. */
const FOLLOW_LIMIT = 14;
const FADE_OPACITY = 0.35;
/** Top-level objects that may turn see-through when they hide a player. */
const FADEABLE = /^(stall_|TREE|BUNTING|BANNER|SIGN)/;

interface Manifest {
  readonly map: string;
  readonly camera: unknown;
  readonly characterScale?: number;
  readonly characters: Readonly<
    Record<string, { file: string; cell: number; anchor: [number, number]; frames: number }>
  >;
}

const color = (css: string) => new THREE.Color(css);

/** What a surface keeps of its colour in shadow (linear RGB): environ2's shadows are violet-tinted, never grey. */
const SHADOW_TINT: readonly [number, number, number] = [0.72, 0.66, 0.86];

/** The toon bands, by how squarely a surface faces the sun: away -> none, glancing -> half, facing -> full. */
function toonGradient(): THREE.DataTexture {
  const levels = [0, 0, 150, 255];
  const data = new Uint8Array(levels.flatMap((v) => [v, v, v, 255]));
  const t = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

let ARROW: THREE.Texture | undefined;
/** The way-back arrow: a chunky red arrow with a white outline, pointing right (rotated per player). */
function arrowTexture(): THREE.Texture {
  if (ARROW) return ARROW;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.beginPath();
    g.moveTo(14, 48);
    g.lineTo(70, 48);
    g.lineTo(70, 22);
    g.lineTo(118, 64);
    g.lineTo(70, 106);
    g.lineTo(70, 80);
    g.lineTo(14, 80);
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 12;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#e8302c';
    g.fill();
  }
  ARROW = new THREE.CanvasTexture(canvas);
  ARROW.colorSpace = THREE.SRGBColorSpace;
  return ARROW;
}

class Character {
  readonly sprite: THREE.Sprite;
  /** Calling a boomerang home: the same flashing aura on each hand (owner, 2026-10-19; render/callAura.ts). */
  readonly #hands: THREE.Mesh[];
  /** A round's start: the white ring spreading from its feet as it lands (render/roundIntro.ts). */
  readonly #landRing: THREE.Mesh;
  #callingAt: number | undefined;
  readonly #ring: THREE.Mesh;
  readonly #shadow: THREE.Mesh;
  readonly #texture: THREE.Texture;
  readonly #arrow: THREE.Sprite;
  readonly #aim: AimLine;
  #heading = 0;
  #deadAt: number | undefined;
  #last: { x: number; y: number; t: number } | undefined;
  logical = { x: 0, y: 0 };

  /** What its remains are made from, as it is now (its feet, its sprite and the frame it shows). */
  victim(id: string, death: ReturnType<typeof deathOf>): Victim {
    const h = this.sprite.scale.y;
    return {
      id,
      at: this.sprite.position.clone(),
      atlas: this.#texture,
      cell: this.cell,
      anchor: this.anchor,
      frame: this.#heading,
      spriteHeight: h,
      bodyHeight: h * BODY_OF_CELL,
      colour: this.colour,
      ...death,
    };
  }

  constructor(
    scene: THREE.Scene,
    atlas: THREE.Texture,
    readonly cell: number,
    readonly anchor: readonly [number, number],
    /** This character's own colour (its aim line; its boomerang and trail are drawn in it too). */
    readonly colour: string,
  ) {
    this.#texture = atlas.clone();
    this.#texture.repeat.set(1 / 16, 1 / 2);
    this.#texture.needsUpdate = true;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.#texture, transparent: true, alphaTest: 0.05 }),
    );
    this.sprite.center.set(anchor[0] / cell, 1 - anchor[1] / cell);
    this.sprite.renderOrder = CHARACTER_RENDER_ORDER;
    this.#ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.#shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x33402a,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    this.#arrow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: arrowTexture(), transparent: true, depthTest: false }),
    );
    this.#arrow.center.set(0.5, 0.5);
    this.#arrow.renderOrder = 10;
    this.#arrow.visible = false;
    this.#hands = [0, 1].map(() => {
      const hand = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 1, 32),
        new THREE.MeshBasicMaterial({
          color: CALL_AURA.colour,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
        }),
      );
      hand.renderOrder = CHARACTER_RENDER_ORDER + 1;
      hand.visible = false;
      return hand;
    });
    this.#landRing = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.#landRing.visible = false;
    scene.add(this.sprite, this.#ring, this.#shadow, this.#arrow, this.#landRing, ...this.#hands);
    this.#aim = new AimLine(scene);
  }

  update(
    space: ReturnType<typeof sceneSpace>,
    cam: THREE.PerspectiveCamera,
    config: MapCameraConfig,
    scale: number,
    c: CircleView,
    now: number,
    /** A round's start: where it is in its landing (render/roundIntro.ts); undefined once play is on. */
    landing?: LandingPose,
  ): void {
    this.logical = { x: c.x, y: c.y };
    const g = space.toScene(c.x, c.y);
    const speed =
      this.#last !== undefined && now > this.#last.t
        ? (Math.hypot(c.x - this.#last.x, c.y - this.#last.y) / (now - this.#last.t)) * 1000
        : 0;
    this.#last = { x: c.x, y: c.y, t: now };
    // calling a boomerang home it stands facing the camera (the banana at 0:18.5), whatever way it faced
    const f = c.calling === true ? { x: 0, y: 1 } : (c.dashing?.direction ?? c.facing);
    if (f !== undefined && Math.hypot(f.x, f.y) > 1e-6) this.#heading = headingFrame(f.x, f.y);
    const airborne = c.dashing !== undefined || c.dead;
    this.#texture.offset.set(this.#heading / 16, airborne ? 0 : 0.5);
    // the same size on screen as the 2D plaza drew it, and the reference characters' hop while running
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    const at = new THREE.Vector3(g.x, g.y, g.z);
    const distance = at.clone().sub(cam.position).dot(forward);
    const h = characterHeight(config, this.cell, scale, distance);
    const hop = speed > 40 ? Math.abs(Math.sin(now / 75)) * 7 : 0;
    this.sprite.position.copy(at);
    this.sprite.scale.set(h, h, 1);
    this.sprite.center.set(this.anchor[0] / this.cell, 1 - (this.anchor[1] + hop) / this.cell);
    const r = space.length(c.radius);
    this.#ring.position.set(g.x, 0.08, g.z);
    this.#ring.scale.set(r, 1, r);
    (this.#ring.material as THREE.MeshBasicMaterial).color = color(c.color);
    this.#shadow.position.set(g.x + 0.15, 0.06, g.z + 0.1);
    this.#shadow.scale.set(r * 0.85, 1, r * 0.55);
    if (c.dead) this.#deadAt ??= now;
    else this.#deadAt = undefined;
    // dead, it is gone at once: its remains (halves, or shards and a puddle) take its place (deathRemains.ts)
    const fade = this.#deadAt === undefined ? 1 : 0;
    const a = (c.dimmed && !c.dead ? 0.5 : 1) * fade;
    (this.sprite.material as THREE.SpriteMaterial).opacity = a;
    this.#warn(c, cam, space, h, now);
    // charging a throw: the aim line, as long as the throw would fly
    if (c.aim !== undefined && c.facing !== undefined && !c.dead)
      this.#aim.show(
        { x: g.x, z: g.z },
        c.facing,
        space.length(c.aim.reach),
        r * 0.35,
        c.aim.power,
        color(this.colour),
      );
    else this.#aim.hide();
    (this.#shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 * a;
    (this.#ring.material as THREE.MeshBasicMaterial).opacity = c.dead ? 0 : 0.85 * a;
    this.#handAura(c, cam, at, h, now);
    this.#land(landing, at, h);
  }

  /** A round's start (the reference video, 0:31.4–0:32.8): not there before its jump, two somersaults in the air, a crouch
   * and a white ring spreading from its feet as it lands. */
  #land(pose: LandingPose | undefined, feet: THREE.Vector3, h: number): void {
    const material = this.sprite.material as THREE.SpriteMaterial;
    material.rotation = pose?.turn ?? 0;
    const ring = this.#landRing.material as THREE.MeshBasicMaterial;
    if (pose === undefined) {
      this.#landRing.visible = false;
      return;
    }
    const body = h * BODY_OF_CELL;
    if (!pose.visible) {
      material.opacity = 0;
      (this.#shadow.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.#ring.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    this.sprite.position.y += pose.lift * body;
    this.sprite.scale.set(h, h * pose.squash, 1);
    this.#landRing.visible = pose.ring !== undefined;
    if (pose.ring !== undefined) {
      this.#landRing.position.set(feet.x, 0.1, feet.z);
      this.#landRing.scale.setScalar(pose.ring.radius * body);
      ring.opacity = 0.9 * pose.ring.opacity;
    }
  }

  /** The aura on both hands while calling: at the body's sides, about a third of its height up, facing the camera. */
  #handAura(
    c: CircleView,
    cam: THREE.PerspectiveCamera,
    feet: THREE.Vector3,
    h: number,
    now: number,
  ): void {
    if (c.calling !== true || c.dead) {
      this.#callingAt = undefined;
      for (const hand of this.#hands) hand.visible = false;
      return;
    }
    this.#callingAt ??= now;
    const lit = auraPulse((now - this.#callingAt) / 1000);
    const body = h * BODY_OF_CELL;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.#hands.forEach((hand, k) => {
      const side = k === 0 ? -1 : 1;
      hand.position
        .copy(feet)
        .addScaledVector(right, side * body * 0.62)
        .addScaledVector(up, body * 0.36);
      hand.quaternion.copy(cam.quaternion);
      hand.scale.setScalar(body * 0.2);
      hand.visible = lit > 0;
      (hand.material as THREE.MeshBasicMaterial).opacity = 0.9 * lit;
    });
  }

  /**
   * Outside the border: the character pulses light red, faster as the limit nears (from 2 to 8 pulses a second), and an
   * arrow above its head points the way back in (the rules' direction, turned into the screen's), bobbing towards it.
   */
  #warn(
    c: CircleView,
    cam: THREE.PerspectiveCamera,
    space: ReturnType<typeof sceneSpace>,
    h: number,
    now: number,
  ): void {
    const material = this.sprite.material as THREE.SpriteMaterial;
    const out = c.outside;
    if (out === undefined || c.dead) {
      material.color.setRGB(1, 1, 1);
      this.#arrow.visible = false;
      return;
    }
    const k = Math.min(1, out.seconds / out.limit);
    const rate = 2 + 6 * k;
    const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * rate * Math.PI * 2);
    const red = 0.25 + 0.55 * pulse;
    material.color.setRGB(1, 1 - red * 0.75, 1 - red * 0.7);
    // the arrow: above the head, rotated to the screen direction of `toward`, nudged along it
    // (h is the atlas CELL's height; the character itself is about a third of it, standing on the anchor)
    const head = this.sprite.position.clone().add(new THREE.Vector3(0, h * 0.5, 0));
    const from = head.clone().project(cam);
    const to = space.toScene(
      this.logical.x + out.toward.x * 100,
      this.logical.y + out.toward.y * 100,
    );
    const toS = new THREE.Vector3(to.x, head.y, to.z).project(cam);
    const angle = Math.atan2((toS.y - from.y) / cam.aspect, toS.x - from.x);
    const bob = (0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 4)) * h * 0.08;
    const dir = new THREE.Vector3(to.x, head.y, to.z).sub(head).setY(0).normalize();
    this.#arrow.position.copy(head).addScaledVector(dir, bob);
    this.#arrow.scale.set(h * 0.3, h * 0.3, 1);
    (this.#arrow.material as THREE.SpriteMaterial).rotation = angle;
    this.#arrow.visible = true;
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(
      this.sprite,
      this.#ring,
      this.#shadow,
      this.#arrow,
      this.#landRing,
      ...this.#hands,
    );
    this.#aim.destroy(scene);
    this.#texture.dispose();
  }
}

/** The boomerang: a brown crescent with the owner's colour on its rim, spinning above its shadow. */
class Boomerang {
  readonly group = new THREE.Group();
  readonly #shadow: THREE.Mesh;
  logical = { x: 0, y: 0 };
  #spentAt: number | undefined;
  #spent = false;
  #charged = false;
  readonly #trail: Trail;
  #state: BoomerangView['state'] = 'THROWN';
  #at = { x: 0, z: 0, flight: 0 };
  #groundedAt: number | undefined;
  /** How high its middle lies when it lies flat on the ground. */
  readonly #rest: number;
  /** Being called home: the video's flashing ring round it (render/callAura.ts). */
  readonly #aura: THREE.Mesh;
  #called = false;
  #calledAt: number | undefined;

  /** `colour`: the thrower's character colour (owner, 2026-10-19): the boomerang is it, its edge a darker shade of it. */
  constructor(scene: THREE.Scene, colour: string, size: number) {
    const arc = Math.PI * 0.76;
    const body = color(colour);
    const wood = new THREE.Mesh(
      new THREE.TorusGeometry(size, size * 0.32, 8, 24, arc),
      new THREE.MeshStandardMaterial({ color: body, roughness: 0.6 }),
    );
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(size * 1.12, size * 0.14, 6, 24, arc),
      new THREE.MeshStandardMaterial({ color: body.clone().multiplyScalar(0.6), roughness: 0.5 }),
    );
    for (const m of [wood, edge]) {
      m.rotation.x = -Math.PI / 2;
      m.castShadow = true;
      this.group.add(m);
    }
    this.#shadow = new THREE.Mesh(
      new THREE.CircleGeometry(size * 1.1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x33402a,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    );
    // its length is about 2.24 × size (the outer edge's span), the aura 1.5 lengths across
    const auraR = (CALL_AURA.ringOfBoomerang * 2.24 * size) / 2;
    this.#aura = new THREE.Mesh(
      new THREE.RingGeometry(auraR * 0.86, auraR, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: CALL_AURA.colour,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.#aura.visible = false;
    scene.add(this.group, this.#shadow, this.#aura);
    this.#trail = new Trail(scene, size * 1.6, body);
    this.#rest = size * 0.35;
  }

  apply(space: ReturnType<typeof sceneSpace>, view: BoomerangView): void {
    this.logical = { x: view.x, y: view.y };
    const p = space.toScene(view.x, view.y, BOOMERANG_HEIGHT);
    this.#at = { x: p.x, z: p.z, flight: p.y };
    this.#state = view.state;
    this.#called = view.called === true;
    this.group.position.set(p.x, p.y, p.z);
    this.#shadow.position.set(p.x + 0.2, 0.05, p.z + 0.1);
    this.#spent = view.spent;
    // a fully charged throw leaves the pink trail (until it is caught or deflected: its power drops)
    const charged = view.power >= 1 && !view.spent;
    if (!charged && this.#charged) this.#trail.clear();
    this.#charged = charged;
  }

  spin(time: number): void {
    // dropped (owner, 2026-10-19): it falls from its flight height under gravity (about 0.3 s), lands flat and lies still;
    // pulled home it flies at its height again, shaking until it arrives
    const { x, z, flight } = this.#at;
    if (this.#state === 'GROUNDED') {
      this.#groundedAt ??= time;
      const t = (time - this.#groundedAt) / 1000;
      const g = (2 * flight) / (0.3 * 0.3);
      const y = Math.max(this.#rest, flight - (g * t * t) / 2);
      this.group.position.set(x, y, z);
      if (y > this.#rest) this.group.rotation.y -= 0.05; // still turning as it falls; still once it lies there
    } else {
      this.#groundedAt = undefined;
      const shake = this.#state === 'RECALLING' ? this.#rest * 0.6 : 0;
      this.group.position.set(
        x + shake * Math.sin(time / 17),
        flight,
        z + shake * Math.cos(time / 23),
      );
    }
    if (this.#called) {
      this.#calledAt ??= time;
      const lit = auraPulse((time - this.#calledAt) / 1000);
      this.#aura.visible = lit > 0;
      (this.#aura.material as THREE.MeshBasicMaterial).opacity = 0.9 * lit;
      this.#aura.position.copy(this.group.position);
    } else {
      this.#calledAt = undefined;
      this.#aura.visible = false;
    }
    if (this.#charged) this.#trail.add(this.group.position, time);
    this.#trail.update(time);
    if (!this.#spent) {
      if (this.#state !== 'GROUNDED') this.group.rotation.y = -time / 40;
      return;
    }
    this.#spentAt ??= time;
    const a = Math.max(0, 1 - (time - this.#spentAt) / 320);
    this.group.scale.setScalar(Math.max(0.001, a));
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(this.group, this.#shadow, this.#aura);
    this.#trail.destroy(scene);
  }
}

/** A short effect: something that grows and fades, then removes itself. */
interface Burst {
  readonly object: THREE.Object3D;
  readonly born: number;
  readonly life: number;
  readonly grow: number;
}

/** Turn an object's descendants around a new pivot (scene point) without moving them. */
function pivotAt(object: THREE.Object3D, pivot: THREE.Vector3): void {
  const offset = pivot.clone().sub(object.position);
  for (const child of object.children) child.position.sub(offset);
  if (object instanceof THREE.Mesh) object.geometry.translate(-offset.x, -offset.y, -offset.z);
  object.position.copy(pivot);
}

class Plaza {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly #space: ReturnType<typeof sceneSpace>;
  readonly #characters = new Map<string, Character>();
  /** Which character each player is drawn as. */
  readonly #kinds = new Map<string, string>();
  /** The characters this map has art for. */
  readonly #hasArt = (kind: PackCharacter): boolean => this.manifest.characters[kind] !== undefined;
  readonly #boomerangs = new Map<string, Boomerang>();
  readonly #books = new Map<number, THREE.Group>();
  readonly #bursts: Burst[] = [];
  readonly #fadeable: { root: THREE.Object3D; materials: THREE.Material[]; opacity: number }[] = [];
  readonly #moving: { object: THREE.Object3D; motion: (t: number) => void }[] = [];
  readonly #banner: HTMLDivElement;
  readonly #atlases = new Map<string, THREE.Texture>();
  #view: ArenaView | undefined;
  #circles: DrawnCircle[] = [];
  #virtual: number | undefined;
  #restX = 0;
  readonly #props: PlazaProps;
  readonly #remains: DeathRemains;
  readonly #blasts: Blasts;
  #badges: PickupBadges | undefined;
  readonly #resize: ResizeObserver;

  constructor(
    readonly container: HTMLElement,
    readonly map: ReconstructedMap,
    readonly config: MapCameraConfig,
    readonly manifest: Manifest,
    readonly characterScale: number,
    gltf: THREE.Group,
    atlases: Map<string, THREE.Texture>,
    floor: { texture: THREE.Texture; extent: { x0: number; x1: number; y0: number; y1: number } },
  ) {
    this.#space = sceneSpace(config);
    this.#atlases = atlases;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    // the floor carries environ2's own shadow shapes (our vector floor), so objects cast none onto it: no double shadows
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(color(map.background));
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.margin = '0 auto';
    // environ2's camera: its lens over the 1920 x 1080 canvas, pitched down, at its centre (Blender units -> scene, Y up)
    const fov = (2 * Math.atan(config.canvas.height / 2 / config.focalPx) * 180) / Math.PI;
    this.camera = new THREE.PerspectiveCamera(fov, CANVAS.width / CANVAS.height, 1, 5000);
    const [cx, cy, cz] = config.centre.map((v) => v * 100) as [number, number, number];
    this.camera.position.set(cx, cz, -cy);
    const th = (config.pitchDeg * Math.PI) / 180;
    this.camera.up.set(0, Math.cos(th), -Math.sin(th));
    this.camera.lookAt(cx, cz - Math.sin(th), -cy - Math.cos(th));
    this.#restX = cx;
    // environ2's cartoon light: a violet ambient (what a surface keeps in shadow) and a sun of the complementary colour, so a
    // fully lit surface shows exactly its own colour and a shadowed one its colour times the violet tint (never grey). The sun
    // travels west, a little away from the viewer, and down; its light falls into soft bands (toon materials, below).
    const sun = new THREE.DirectionalLight(
      new THREE.Color(1 - SHADOW_TINT[0], 1 - SHADOW_TINT[1], 1 - SHADOW_TINT[2]),
      Math.PI,
    );
    const travel = new THREE.Vector3(-1, -1.1, -0.25).normalize();
    sun.position.set(0, 0, -72).addScaledVector(travel, -150);
    sun.target.position.set(0, 0, -72);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, {
      left: -60,
      right: 60,
      top: 60,
      bottom: -60,
      near: 1,
      far: 400,
    });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(
      sun,
      sun.target,
      new THREE.AmbientLight(new THREE.Color(...SHADOW_TINT), Math.PI),
    );
    this.scene.add(gltf);
    // our vector floor (art/reconstruction/environ2/blender/floor_vector.py): one crisp flat-coloured ground, top-down
    for (const o of [...gltf.children]) if (/^(FLOOR|RUG)/.test(o.name)) o.removeFromParent();
    this.scene.add(plazaFloor(floor.texture, floor.extent));
    const gradient = toonGradient();
    gltf.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.name === 'FOUNTAIN_water') return;
      const m = o.material as THREE.MeshStandardMaterial;
      o.material = new THREE.MeshToonMaterial({
        color: m.color,
        map: m.map ?? null,
        gradientMap: gradient,
        side: m.side,
      });
    });
    gltf.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const floor = o.name.startsWith('FLOOR') || o.name.startsWith('RUG');
        o.castShadow = !floor;
        o.receiveShadow = true;
      }
    });
    // ~780 separate meshes were too slow for a TV (owner, 2026-10-19): each object's parts are merged by look, and the
    // objects that never move, fade or break into one; crates and pots (they break) and the water stay as they are
    batchPlaza(gltf, (root) =>
      FADEABLE.test(root.name)
        ? 'own'
        : /^(CRATE|POT)_|^FOUNTAIN_water$/.test(root.name)
          ? 'leave'
          : 'shared',
    );
    for (const root of gltf.children) {
      if (FADEABLE.test(root.name)) {
        const materials: THREE.Material[] = [];
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.material = (o.material as THREE.Material).clone();
            (o.material as THREE.Material).transparent = true;
            materials.push(o.material as THREE.Material);
          }
        });
        this.#fadeable.push({ root, materials, opacity: 1 });
      }
    }
    this.#props = new PlazaProps(this.scene, gltf, this.#space, gradient);
    this.#remains = new DeathRemains(this.scene, (u) => this.#space.length(u));
    this.#blasts = new Blasts(this.scene);
    this.#animate(gltf);
    this.#banner = document.createElement('div');
    Object.assign(this.#banner.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: '4%',
      textAlign: 'center',
      font: 'bold 54px system-ui, sans-serif',
      color: '#fff',
      textShadow: '0 0 8px #2a2f55, 0 0 2px #2a2f55',
      pointerEvents: 'none',
      display: 'none',
    });
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(this.#banner);
    this.#badges = new PickupBadges(container, this.renderer.domElement);
    this.#resize = new ResizeObserver(() => this.#fit());
    this.#resize.observe(container);
    this.#fit();
    this.renderer.setAnimationLoop((t) => this.#frame(t));
  }

  /** The canvas keeps 16:9, as large as the container allows, centred (Phaser's FIT). */
  #fit(): void {
    const w0 = this.container.clientWidth || CANVAS.width;
    const h0 = this.container.clientHeight || CANVAS.height;
    const w = Math.min(w0, (h0 * CANVAS.width) / CANVAS.height);
    this.renderer.setSize(w, (w * CANVAS.height) / CANVAS.width);
    this.renderer.domElement.style.marginTop = `${Math.max(0, (h0 - (w * CANVAS.height) / CANVAS.width) / 2)}px`;
  }

  /** The plaza's own motion: pennants swing on the rope, canopies sway on their legs, the round tree breathes, water ripples. */
  #animate(gltf: THREE.Group): void {
    const T = 4000;
    const wave = (amp: number, phase: number, t: number, speed = 1) =>
      amp * (Math.sin((2 * Math.PI * speed * t) / T + phase) - Math.sin(phase));
    const box = new THREE.Box3();
    let pennant = 0;
    for (const root of [...gltf.children]) {
      if (root.name.startsWith('BUNTING_pennant')) {
        box.setFromObject(root);
        const top = new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.max.y,
          (box.min.z + box.max.z) / 2,
        );
        pivotAt(root, top);
        const i = pennant++;
        this.#moving.push({
          object: root,
          motion: (t) => {
            root.rotation.x = wave(0.25, -0.7 * i, t);
            root.rotation.z = wave(0.09, -0.7 * i + 1.3, t);
          },
        });
      } else if (/^TREE_\d+_tree$/.test(root.name) || root.name === 'TREE29_trunk') {
        box.setFromObject(root);
        const centre = box.getCenter(new THREE.Vector3());
        centre.y = box.min.y;
        pivotAt(root, centre);
        const k = this.#moving.length;
        this.#moving.push({
          object: root,
          motion: (t) => {
            root.rotation.x = wave(0.025, 0.9 * k, t);
            root.rotation.z = wave(0.02, 0.9 * k + 1.7, t);
          },
        });
      } else if (root.name.startsWith('TREE29_leaf')) {
        box.setFromObject(root);
        pivotAt(root, box.getCenter(new THREE.Vector3()));
        const k = this.#moving.length;
        this.#moving.push({
          object: root,
          motion: (t) => root.scale.setScalar(1 + wave(0.04, 0.45 * k, t)),
        });
      }
    }
    // water: drifting rings and glints painted on a transparent disc just above the water
    const water = gltf.getObjectByName('FOUNTAIN_water');
    if (water instanceof THREE.Mesh) {
      // the water's own material (Blender's gradient does not survive the export): clear turquoise, glossy
      water.material = new THREE.MeshStandardMaterial({
        color: 0x3fb7d6,
        roughness: 0.12,
        metalness: 0,
        emissive: 0x0b4f63,
        emissiveIntensity: 0.35,
      });
      water.receiveShadow = true;
      water.castShadow = false;
      box.setFromObject(water);
      const c = box.getCenter(new THREE.Vector3());
      const radius = (box.max.x - box.min.x) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        for (let r = 70; r < 128; r += 18) {
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(128, 128, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < 26; i += 1) {
          const a = (i * 2.4) % (Math.PI * 2);
          const r = 72 + ((i * 37) % 52);
          ctx.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 7, 2);
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const ripples = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 0.98, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          opacity: 0.8,
        }),
      );
      ripples.position.set(c.x, box.max.y + 0.04, c.z);
      this.scene.add(ripples);
      this.#moving.push({
        object: ripples,
        motion: (t) => {
          const s = 1 + 0.06 * ((t % 2000) / 2000);
          ripples.scale.set(s, 1, s);
          ripples.rotation.y = (t / 9000) * Math.PI * 2;
          (ripples.material as THREE.MeshBasicMaterial).opacity =
            0.55 + 0.25 * Math.sin((t / 2000) * Math.PI);
        },
      });
    }
  }

  show(view: ArenaView): void {
    this.#view = view;
    const now = this.#virtual ?? performance.now();
    const present = new Set<string>();
    this.#circles = [];
    const scale = this.characterScale;
    for (const c of view.circles) {
      present.add(c.id);
      let ch = this.#characters.get(c.id);
      if (ch === undefined) {
        const kind = characterOf(this.map.roster, c, this.#hasArt);
        const meta = this.manifest.characters[kind];
        const atlas = this.#atlases.get(kind);
        if (meta === undefined || atlas === undefined) continue;
        ch = new Character(this.scene, atlas, meta.cell, meta.anchor, CHARACTER_COLOURS[kind]);
        this.#characters.set(c.id, ch);
        this.#kinds.set(c.id, kind);
      }
      const order = view.intro?.order.indexOf(c.id) ?? -1;
      ch.update(
        this.#space,
        this.camera,
        this.config,
        scale,
        c,
        now,
        view.intro === undefined || order < 0 ? undefined : landingPose(view.intro.elapsed, order),
      );
      this.#circles.push({ id: c.id, x: c.x, y: c.y });
    }
    // back alive (a new round): their remains go
    for (const c of view.circles) if (!c.dead && this.#remains.has(c.id)) this.#remains.clear(c.id);
    for (const [id, ch] of this.#characters)
      if (!present.has(id)) {
        ch.destroy(this.scene);
        this.#characters.delete(id);
        this.#kinds.delete(id);
      }
    const flying = new Set<string>();
    for (const b of view.boomerangs) {
      flying.add(b.id);
      let art = this.#boomerangs.get(b.id);
      if (art === undefined) {
        // in its thrower's character colour (a yellow banana throws a yellow boomerang)
        const owner = view.circles.find((c) => c.id === b.ownerId);
        const kind = characterOf(this.map.roster, owner ?? { number: 1 }, this.#hasArt);
        art = new Boomerang(
          this.scene,
          CHARACTER_COLOURS[kind],
          this.#space.length(b.radius) * 1.4,
        );
        this.#boomerangs.set(b.id, art);
      }
      art.apply(this.#space, b);
    }
    for (const [id, art] of this.#boomerangs)
      if (!flying.has(id)) {
        art.destroy(this.scene);
        this.#boomerangs.delete(id);
      }
    const lying = new Set<number>();
    for (const p of view.pickups) {
      lying.add(p.id);
      if (!this.#books.has(p.id)) {
        // the reference video's Book (4:10, 10:15): bright cyan, standing on end, a white "?" on its cover, a red gem on top;
        // about half a character wide and nearly as tall (our characters are drawn ~46 u wide, ~62 u tall)
        const book = bookModel(
          this.#space.length(23),
          this.#space.length(52),
          this.#space.length(9),
        );
        const at = this.#space.toScene(p.x, p.y, 0);
        book.position.set(at.x, at.y, at.z);
        book.userData = { x: p.x, y: p.y };
        this.scene.add(book);
        this.#books.set(p.id, book);
      }
    }
    for (const [id, book] of this.#books)
      if (!lying.has(id)) {
        this.scene.remove(book);
        this.#books.delete(id);
      }
    this.#props.show(view, now);
    for (const e of view.events) this.#event(e, now);
    this.#banner.textContent = view.banner ?? '';
    this.#banner.style.display = view.banner === undefined ? 'none' : 'block';
  }

  #event(e: ViewEvent, now: number): void {
    const at = this.#space.toScene(e.x, e.y, 30);
    const tint = color(e.color);
    const add = (object: THREE.Object3D, life: number, grow: number) => {
      object.position.set(at.x, at.y, at.z);
      this.scene.add(object);
      this.#bursts.push({ object, born: now, life, grow });
    };
    if (e.type === 'HIT' && e.actor !== undefined) {
      // the victim comes apart across the line of the hit: halves (or, the mug, shards); the mug and the milk spill
      const ch = this.#characters.get(e.actor);
      const circle = this.#view?.circles.find((c) => c.id === e.actor);
      if (ch !== undefined && circle !== undefined) {
        const kind = characterOf(this.map.roster, circle, this.#hasArt);
        const victim = ch.victim(e.actor, deathOf(kind));
        let hit: { x: number; z: number } | undefined;
        if (e.from !== undefined) {
          const f = this.#space.toScene(e.from.x, e.from.y);
          const d = { x: victim.at.x - f.x, z: victim.at.z - f.z };
          if (Math.hypot(d.x, d.z) > 1e-6) hit = d;
        }
        this.#remains.burst(victim, hit, now);
      }
    } else if (e.type === 'RICOCHET') {
      // a boomerang bounced off a wall: a small spark there, in its thrower's character colour
      const owner = this.#view?.circles.find((c) => c.id === e.ownerId);
      const kind = characterOf(this.map.roster, owner ?? { number: 1 }, this.#hasArt);
      const spark = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 1, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: color(CHARACTER_COLOURS[kind]),
          transparent: true,
          depthWrite: false,
        }),
      );
      add(spark, 220, 1.6);
    } else if (e.type === 'BLASTED') {
      // the reference video's blast: puff, flash, the ring out to the radius that kills, smoke (render/blastMotion.ts)
      if (e.radius !== undefined) {
        const ground = this.#space.toScene(e.x, e.y, 2);
        this.#blasts.burst(
          new THREE.Vector3(ground.x, ground.y, ground.z),
          this.#space.length(e.radius),
          now,
        );
      }
    } else if (e.type === 'SLASHED' && e.swing) {
      const reach = this.#space.length(e.swing.reach);
      const angle = Math.atan2(e.swing.direction.y, e.swing.direction.x);
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(
          reach * 0.55,
          reach,
          32,
          1,
          -angle - e.swing.arc / 2,
          e.swing.arc,
        ).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      add(arc, 180, 0.1);
    } else if (e.type === 'PICKUP' && e.actor !== undefined && e.kind !== undefined) {
      this.#badges?.show(e.actor, e.kind, now);
      const shade = color(POWER_BADGE[e.kind].colour);
      for (let k = 0; k < 12; k += 1) {
        const a = (k / 12) * Math.PI * 2;
        const shard = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.5, 0.5),
          new THREE.MeshBasicMaterial({ color: shade, transparent: true }),
        );
        shard.userData['dir'] = new THREE.Vector3(Math.cos(a), 0.4, Math.sin(a));
        add(shard, 450, 0);
      }
    } else if (e.type === 'SPAWNED' || e.type === 'PICKUP') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 1.6, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: tint, transparent: true, depthWrite: false }),
      );
      add(ring, 600, 2.5);
    }
  }

  /** A tall object between the camera and a living player turns see-through, so nobody is ever hidden. */
  #fadeWhatHidesSomeone(): void {
    const ray = new THREE.Raycaster();
    const hiding = new Set<THREE.Object3D>();
    const roots = this.#fadeable.map((f) => f.root);
    for (const [id, ch] of this.#characters) {
      const c = this.#view?.circles.find((q) => q.id === id);
      if (c === undefined || c.dead) continue;
      const head = ch.sprite.position.clone().add(new THREE.Vector3(0, ch.sprite.scale.y * 0.5, 0));
      const dir = head.clone().sub(this.camera.position);
      const far = dir.length();
      ray.set(this.camera.position, dir.normalize());
      ray.far = far - 0.5;
      for (const hit of ray.intersectObjects(roots, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !roots.includes(o)) o = o.parent;
        if (o) hiding.add(o);
      }
    }
    for (const f of this.#fadeable) {
      const target = hiding.has(f.root) ? FADE_OPACITY : 1;
      f.opacity += (target - f.opacity) * 0.25;
      for (const m of f.materials) m.opacity = f.opacity;
    }
  }

  /**
   * The camera follows a player who walks out beyond the dashed lines: it slides sideways (never turns or zooms) just far
   * enough to keep everyone inside the screen's edge margin, and eases back when they return. Presentation only.
   */
  #follow(): void {
    // the camera never turns (yaw and roll are 0), so a point's screen x is (x - camera x) / (depth * tan(half fov)): the slide
    // each player needs is measured from the RESTING camera, so the camera holds steady while they stay out
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect;
    const margin = 0.9;
    let right = 0;
    let left = 0;
    for (const [id, ch] of this.#characters) {
      const c = this.#view?.circles.find((q) => q.id === id);
      if (c === undefined || c.dead) continue;
      const p = ch.sprite.position;
      const half = p.clone().sub(this.camera.position).dot(forward) * tanHalf * margin;
      right = Math.max(right, p.x - this.#restX - half);
      left = Math.min(left, p.x - this.#restX + half);
    }
    // players beyond both edges at once: the camera splits the difference (nobody far off-screen)
    const wanted = Math.max(-FOLLOW_LIMIT, Math.min(FOLLOW_LIMIT, right + left));
    this.camera.position.x += (this.#restX + wanted - this.camera.position.x) * 0.1;
  }

  #frame(t: number): void {
    const time = this.#virtual ?? t;
    this.#follow();
    for (const m of this.#moving) m.motion(time);
    for (const b of this.#boomerangs.values()) b.spin(time);
    this.#props.frame(time);
    this.#remains.frame(time);
    this.#badges?.frame(time, this.camera, (id) => {
      const ch = this.#characters.get(id);
      if (ch === undefined) return undefined;
      // above the character's head: the top of its body
      return ch.sprite.position.clone().add(new THREE.Vector3(0, ch.sprite.scale.y * 0.42, 0));
    });
    this.#blasts.frame(time);
    for (let i = this.#bursts.length - 1; i >= 0; i -= 1) {
      const b = this.#bursts[i] as Burst;
      const k = (time - b.born) / b.life;
      if (k >= 1) {
        this.scene.remove(b.object);
        this.#bursts.splice(i, 1);
        continue;
      }
      const dir = b.object.userData['dir'] as THREE.Vector3 | undefined;
      if (dir) b.object.position.addScaledVector(dir, 0.12);
      if (b.grow) b.object.scale.setScalar(1 + b.grow * k);
      const m = (b.object as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 1 - k;
    }
    this.#fadeWhatHidesSomeone();
    this.renderer.render(this.scene, this.camera);
  }

  drive(): (virtualMs: number) => void {
    this.renderer.setAnimationLoop(null);
    return (virtualMs) => {
      this.#virtual = virtualMs;
      this.#frame(virtualMs);
    };
  }

  drawn(): readonly DrawnCircle[] {
    return this.#circles;
  }
  drawnBoomerangs(): readonly DrawnCircle[] {
    return [...this.#boomerangs].map(([id, b]) => ({ id, ...b.logical }));
  }
  drawnPickups(): readonly DrawnCircle[] {
    return [...this.#books].map(([id, b]) => ({
      id: String(id),
      x: b.userData['x'] as number,
      y: b.userData['y'] as number,
    }));
  }
  /** Where a player's body (half its height up) is on screen, as fractions of the viewport. */
  screenOf(id: string): { readonly x: number; readonly y: number } | undefined {
    const c = this.#view?.circles.find((q) => q.id === id);
    if (c === undefined || typeof window === 'undefined') return undefined;
    const at = this.#space.toScene(c.x, c.y, 30);
    const p = new THREE.Vector3(at.x, at.y, at.z).project(this.camera);
    const box = this.renderer.domElement.getBoundingClientRect();
    if (box.width === 0 || window.innerWidth === 0) return undefined;
    return {
      x: (box.left + ((p.x + 1) / 2) * box.width) / window.innerWidth,
      y: (box.top + ((1 - p.y) / 2) * box.height) / window.innerHeight,
    };
  }

  drawnCharacters(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.#kinds);
  }

  drawnProps(): { readonly broken: readonly string[]; readonly pieces: number } {
    return this.#props.drawn();
  }
  drawnWalls(): readonly WallView[] {
    return this.#view?.walls ?? [];
  }

  destroy(): void {
    this.renderer.setAnimationLoop(null);
    this.#resize.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.#banner.remove();
    for (const t of this.#atlases.values()) t.dispose();
  }
}

/** Creates the 3D plaza inside `container` and resolves once its models and characters are loaded and a frame is drawn. */
export async function createThreePlaza(
  container: HTMLElement,
  map: ReconstructedMap,
): Promise<ArenaRenderer> {
  const at = `${import.meta.env.BASE_URL}${map.assetDir}`;
  const res = await fetch(`${at}manifest.json`);
  if (!res.ok) throw new Error(`plaza manifest: HTTP ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  if (manifest.map !== map.id) throw new Error(`manifest is for ${manifest.map}, not ${map.id}`);
  const config = parseMapCamera(manifest.camera);
  const { characterScale } = parseMapLayers({
    occluders: [],
    characterScale: manifest.characterScale,
  });
  const gltf = await new GLTFLoader().loadAsync(`${at}plaza.glb`);
  const loader = new THREE.TextureLoader();
  const atlases = new Map<string, THREE.Texture>();
  await Promise.all(
    Object.entries(manifest.characters).map(async ([kind, c]) => {
      if (!/^[A-Za-z0-9_-]{1,64}\.(webp|png)$/.test(c.file))
        throw new Error('plaza manifest: bad character file');
      const t = await loader.loadAsync(`${at}${c.file}`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.LinearFilter;
      atlases.set(kind, t);
    }),
  );
  const floorRes = await fetch(`${at}floor.json`);
  if (!floorRes.ok) throw new Error(`plaza floor: HTTP ${floorRes.status}`);
  const extent = (await floorRes.json()) as { x0: number; x1: number; y0: number; y1: number };
  for (const v of [extent.x0, extent.x1, extent.y0, extent.y1])
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('plaza floor: bad extent');
  const floorTexture = await loader.loadAsync(`${at}floor.webp`);
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  floorTexture.anisotropy = 8;
  const plaza = new Plaza(container, map, config, manifest, characterScale, gltf.scene, atlases, {
    texture: floorTexture,
    extent,
  });
  return {
    render: (view) => plaza.show(view),
    drawn: () => plaza.drawn(),
    drawnBoomerangs: () => plaza.drawnBoomerangs(),
    drawnPickups: () => plaza.drawnPickups(),
    drawnProps: () => plaza.drawnProps(),
    drawnCharacters: () => plaza.drawnCharacters(),
    screenOf: (id) => plaza.screenOf(id),
    drawnWalls: () => plaza.drawnWalls(),
    drawnSystems: () => undefined,
    driveClock: () => plaza.drive(),
    destroy: () => plaza.destroy(),
  };
}

/** The reference video's power Book: a glowing cyan book standing on end, a white "?" on its cover, a red gem on its top. */
function bookModel(width: number, height: number, depth: number): THREE.Group {
  const book = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g !== null) {
    g.fillStyle = '#3fe6f2';
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#ffffff';
    g.font = '900 96px ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', 32, 72);
  }
  const front = new THREE.CanvasTexture(canvas);
  const cyan = new THREE.MeshBasicMaterial({ color: '#3fe6f2' });
  const cover = new THREE.MeshBasicMaterial({ map: front });
  // faces: +x, -x, +y, -y, +z (towards the camera), -z
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [
    cyan,
    cyan,
    cyan,
    cyan,
    cover,
    cyan,
  ]);
  body.position.y = height / 2;
  body.castShadow = true;
  const gem = new THREE.Mesh(
    new THREE.SphereGeometry(width * 0.16, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#e0283a' }),
  );
  gem.position.set(width * 0.25, height + width * 0.08, 0);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(width * 1.1, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: '#7ff4ff',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  glow.position.y = 0.06;
  book.add(body, gem, glow);
  return book;
}
