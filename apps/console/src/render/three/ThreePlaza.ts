import { ICE_LOOK } from '../iceLook';
import { GroundMarks } from './groundMarks';
import { ClosingBorder } from './closingBorder';
import { blockScale, freezeBody, thawBody } from '../iceMotion';
import { FIRE_MOTION, flameBall } from '../fireMotion';
import { SHIELD_LOOK } from '../shieldLook';
import { Flipbooks } from './flipbooks';
import { IceShards, iceBlockGeometry } from './iceShards';
import { bookScale } from '../pickupMotion';
import { DRAWN_CHARACTER_WIDTH } from '../drawnSize';
import { EXPLOSIVE_TICK, tickAt } from '../explosiveTick';
import * as THREE from 'three';
import { beamsOverlay, type LightBeams } from './beams';
import { sliderNodeIndex, sliderOffset } from './sliderNodes';
import { isBareFrame, withoutActors } from './bareFrame';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  STAND_PULL,
  mistedUnlit,
  parseSoftLook,
  skyBackground,
  softLights,
  softMaterial,
} from './softLook';
import type { ArenaRenderer, DrawnCircle } from '../renderer';
import type { ArenaView, BoomerangView, CircleView, ViewEvent, WallView } from '../viewModel';
import { parseMapCamera, type MapCameraConfig } from '../reconstructed/mapCamera';
import { parseMapLayers } from '../reconstructed/mapLayers';
import { CHARACTER_COLOURS } from '../reconstructed/characterColours';
import { TEAM_HANDS, recolourPixels } from '../../characters/teamRecolour';
import {
  characterOf,
  headingFrame,
  type PackCharacter,
  type ReconstructedMap,
} from '../reconstructed/maps';
import { AimChevron, Trail } from './chargeVisuals';
import { Hands } from './hands';
import {
  CAMERA_FRAMING,
  frameTarget,
  springCamera,
  type CameraFrame,
  type CameraMotion,
  type FramingLimits,
} from '../cameraFraming';
import { DashTrail } from './dashTrail';
import { flashAt, frameAt, parsePortalSpin, ringAt, spinAt, type PortalSpin } from './portalSpin';
import { flipFrameAt, parsePortalFlip, portalFlipPart } from './portalFlip';
import { parsePlantGroups, type FireSource, type Pusher } from '../hexPlants';
import { HexPlantsView } from './hexPlantsView';
import { sceneryMotion } from './sceneryMotion';
import { penTintFactor, penWallAt } from '../penOpening';
import { PenBurst } from './penBurst';
import { parseHands, type CharacterHands, type SceneOffset } from '../characterRig';
import { windUp } from '../aimLook';
import { WALK, walkPose, type WalkPose } from '../walkMotion';
import { SLASH_LOOK, swingAngle, swoosh } from '../slashMotion';
import { BOOMERANG_LOOK } from '../boomerangLook';
import { boomerangBody, boomerangGeometry } from './boomerangModel';
import { CALL_AURA, auraIn, auraLeftBehind } from '../callAura';
import { landingPose, type LandingPose } from '../roundIntro';
import { fallPose } from '../fallMotion';
import { READY_GO, popScale, sparks } from '../readyGo';
import { deathOf } from '../deathMotion';
import { Blasts } from './blasts';
import { PickupBadges } from './pickupBadges';
import { POWER_BADGE } from '../powerBadge';
import { DeathRemains, type Victim } from './deathRemains';
import { CharacterModels } from './characterModels';
import { CHARACTER_RENDER_ORDER, plazaFloor } from './plazaFloor';
import { waterMaterial, type WaterStyle } from './waterShader';
import { canalWaterMaterial, parseCanalWater } from './canalWater';
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
/** The rules' walking speed, world units a second (DEFAULT_FU_CONFIG.playerSpeed): full pace for the walk's motion. */
const WALK_SPEED = 360;
/** How far (scene units) the camera may slide sideways to follow a player out onto the sand beyond the dashed lines. */
const FADE_OPACITY = 0.35;
/** Top-level objects that may turn see-through when they hide a player. */
const FADEABLE = /^(stall_|TREE|BUNTING|BANNER|SIGN)/;
/** The water's field as water_field.py bakes it: over the water's box widened 3%, distances up to 2 units. */
const WATER_FIELD = { margin: 1.03, far: 2 } as const;

interface Manifest {
  readonly map: string;
  readonly camera: unknown;
  /** Another map whose character atlases this one shares (the gong islands: the plaza's). */
  readonly assetsFrom?: string;
  /**
   * A camera that stays where it is: the whole map in one frame, as the reference shows it (the cross pond: a small map, its
   * camera fixed at zoom 1.12). Without it the camera follows the players, as the plaza's does.
   */
  readonly fixedFrame?: { readonly zoom: number; readonly u: number; readonly v: number };
  /** The camera follows the players between these zooms (the lily island: the HQ's camera zooms in as the players come together). */
  readonly followFrame?: { readonly minZoom: number; readonly maxZoom: number };
  /** The HQ frame this map was built from (the camera pinned to it, `?frame=hq`, to compare the game with the video's frame). */
  readonly hqFrame?: { readonly zoom: number; readonly u: number; readonly v: number };
  /** The map's own water colours (the cross pond's pond: duller than the fountain's); the fountain's when absent. */
  readonly water?: WaterStyle;
  /** Light beams added over everything on the screen (the bridge islands: the HQ 1:12's top right; beams.ts). */
  readonly beams?: LightBeams;
  /** The map's own light instead of the plaza's toon light (softLook.ts; the gong islands). */
  readonly look?: unknown;
  readonly characterScale?: number;
  readonly characters: Readonly<
    Record<
      string,
      {
        file: string;
        cell: number;
        anchor: [number, number];
        frames: number;
        /** The same atlas without its two side hands, which the game draws (render/characterRig.ts). */
        body?: string;
        hands?: unknown;
      }
    >
  >;
}

const color = (css: string) => new THREE.Color(css);

/** The warm-up pens' walls' top (the HQ, art/warm_up: #aab3e3), and its levers' knobs' lit green (linear: build.py's #8aeaff). */
const PEN_WALL_TOP = new THREE.Color('#aab3e3');
const KNOB_LIT = new THREE.Color('#8aeaff').g;

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

/** The Shield's bubble as a picture (render/shieldLook.ts): nearly clear inside, a pale rim, pink on its right, a highlight. */
function bubbleTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const n = 128;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const g = canvas.getContext('2d');
  if (g === null) return null;
  const c = n / 2;
  const fill = g.createRadialGradient(c, c, n * 0.3, c, c, n * 0.49);
  fill.addColorStop(0, 'rgba(255,255,255,0.06)');
  fill.addColorStop(0.75, 'rgba(255,255,255,0.18)');
  fill.addColorStop(1, 'rgba(255,255,255,0.55)');
  g.fillStyle = fill;
  g.beginPath();
  g.arc(c, c, n * 0.49, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = n * 0.025;
  g.strokeStyle = SHIELD_LOOK.rim;
  g.stroke();
  g.strokeStyle = SHIELD_LOOK.rimPink;
  g.lineWidth = n * 0.05;
  g.beginPath();
  g.arc(c, c, n * 0.46, -0.9, 0.9);
  g.stroke();
  g.strokeStyle = SHIELD_LOOK.rimLine;
  g.lineWidth = n * 0.015;
  g.beginPath();
  g.arc(c, c, n * 0.485, -0.6, 0.7);
  g.stroke();
  g.fillStyle = SHIELD_LOOK.highlight;
  g.beginPath();
  g.ellipse(c - n * 0.2, c - n * 0.24, n * 0.07, n * 0.035, -0.7, 0, Math.PI * 2);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let disc: THREE.CanvasTexture | undefined;
/** A soft white disc (white at the middle, clear at the rim): the Explosive's bloom and flash. Shared. */
function softDisc(): THREE.CanvasTexture {
  if (disc !== undefined) return disc;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g !== null) {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.95)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  disc = new THREE.CanvasTexture(canvas);
  disc.colorSpace = THREE.SRGBColorSpace;
  return disc;
}

/**
 * READY and GO over the canvas, as the HQ video draws them (render/readyGo.ts): the traced word (public/ui/*.svg) at the
 * screen's middle and the video's size, popping in, and GO's eight dashes. Sized to the canvas, by its height.
 */
function readyGoOverlay(): {
  root: HTMLDivElement;
  show: (word: 'READY' | 'GO' | undefined, age: number, canvas: HTMLCanvasElement) => void;
} {
  const root = document.createElement('div');
  Object.assign(root.style, { position: 'absolute', pointerEvents: 'none', display: 'none' });
  const img = document.createElement('img');
  img.alt = '';
  Object.assign(img.style, { position: 'absolute', display: 'block' });
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  Object.assign(svg.style, { position: 'absolute', inset: '0', overflow: 'visible' });
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  const lines = Array.from({ length: 8 }, () => {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('stroke', '#fff');
    l.setAttribute('stroke-linecap', 'round');
    svg.appendChild(l);
    return l;
  });
  root.append(img, svg);
  let shown: string | undefined;
  return {
    root,
    show(word, age, canvas) {
      if (word === undefined) {
        root.style.display = 'none';
        shown = undefined;
        return;
      }
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      Object.assign(root.style, {
        display: 'block',
        left: `${canvas.offsetLeft}px`,
        top: `${canvas.offsetTop}px`,
        width: `${w}px`,
        height: `${h}px`,
      });
      const k = h / READY_GO.screenHeight;
      const box = word === 'READY' ? READY_GO.ready : READY_GO.go;
      if (shown !== word) {
        img.src = `${import.meta.env.BASE_URL}ui/${word.toLowerCase()}.svg`;
        shown = word;
      }
      Object.assign(img.style, {
        left: `${w / 2 + box.x * k}px`,
        top: `${h / 2 + box.y * k}px`,
        width: `${box.width * k}px`,
        height: `${box.height * k}px`,
        transformOrigin: `${-box.x * k}px ${-box.y * k}px`,
        transform: `scale(${popScale(age)})`,
      });
      const dashes = word === 'GO' ? sparks(age) : [];
      lines.forEach((l, i) => {
        const d = dashes[i];
        l.style.display = d === undefined ? 'none' : '';
        if (d === undefined) return;
        const r = Math.hypot(d.outer.x, d.outer.y);
        const inner = Math.max(0, r - d.length) / r;
        l.setAttribute('x1', String(w / 2 + d.outer.x * k));
        l.setAttribute('y1', String(h / 2 + d.outer.y * k));
        l.setAttribute('x2', String(w / 2 + d.outer.x * inner * k));
        l.setAttribute('y2', String(h / 2 + d.outer.y * inner * k));
        l.setAttribute('stroke-width', String(READY_GO.sparks.width * k));
      });
    },
  };
}

class Character {
  readonly sprite: THREE.Sprite;
  /**
   * On ground that is 3D (softLook.ts: the gong islands' grass), how far toward the camera the picture is drawn: a character
   * is a flat picture at the depth of its feet, so the ground just in front of its feet hid the bottom of it (owner,
   * 2026-10-23: "the characters seem to pass through the grass"). Moved along the line from the camera through its feet and
   * scaled to match, it looks exactly the same, but only something nearer than this hides it. 0: the plaza (its floor hides
   * nothing).
   */
  standPull = 0;
  /** Calling a boomerang home: two concentric rings on each hand (ss02; owner, 2026-10-19; render/callAura.ts). */
  readonly #hands: THREE.Mesh[];
  /** A round's start: the white ring spreading from its feet as it lands (render/roundIntro.ts). */
  readonly #landRing: THREE.Mesh;
  /** ICE_BOOMERANG: the block of ice it stands frozen in (render/iceLook.ts). */
  readonly #ice: THREE.Mesh;
  /** The body's recolouring while frozen (its sprite's shader): the colour and how much of it. */
  readonly #recolour = { colour: { value: new THREE.Color('#ffffff') }, amount: { value: 0 } };
  /** When it froze, and when its ice broke (render/iceMotion.ts). */
  #frozenAt: number | undefined;
  #thawedAt: number | undefined;
  /** FIRE_BOOMERANG: the fire balls climbing it while it burns (render/fireMotion.ts), and when it caught. */
  readonly #flames: THREE.Mesh[];
  #burningAt: number | undefined;
  /** It was burning when last drawn (a death now is a death by fire). */
  wasBurning = false;
  /** It was frozen when last drawn (a death now bursts its ice block too). */
  wasFrozen = false;
  /** The video's own effects (flipbooks.ts) and one character width in scene units, once the plaza has them. */
  effects: { readonly flipbooks: Flipbooks; readonly w: number } | undefined;
  /** SHIELD: the bubble round it while it owns the Shield (render/shieldLook.ts). */
  readonly #bubble: THREE.Sprite;
  #callingAt: number | undefined;
  readonly #ring: THREE.Mesh;
  readonly #shadow: THREE.Mesh;
  readonly #texture: THREE.Texture;
  readonly #arrow: THREE.Sprite;
  readonly #aim: AimChevron;
  #heading = 0;
  /** Its walk this frame (render/walkMotion.ts), and which way it moves on screen (-1 left … 1 right). */
  #walk: { pose: WalkPose; pace: number; toward: number } = {
    pose: { hop: 0, rock: 0, swing: 0 },
    pace: 0,
    toward: 0,
  };
  #moving = 0;
  /** Dashing: the see-through squares it leaves along its way (render/three/dashTrail.ts). */
  readonly #dashTrail: DashTrail;
  /** Swinging: the white crescent round the front of its feet (render/slashMotion.ts). */
  readonly #swoosh = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1, 8),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }),
  );
  /** Its own two hands, drawn by the game (render/three/hands.ts); undefined: they are baked into its sprite. */
  readonly #ownHands: Hands | undefined;
  #deadAt: number | undefined;
  /** It walked off the ground (the sky islands): when it went over (render/fallMotion.ts). */
  #fellAt: number | undefined;

  /** It has fallen off the ground: instead of coming apart it drops away, waving (render/fallMotion.ts). */
  fall(now: number): void {
    this.#fellAt = now;
  }
  #last: { x: number; y: number; t: number } | undefined;
  logical = { x: 0, y: 0 };

  /** What its remains are made from, as it is now (its feet, its sprite and the frame it shows). */
  victim(
    id: string,
    death: ReturnType<typeof deathOf> &
      Partial<Pick<Victim, 'burnt' | 'videoSmoke' | 'kind' | 'handColour' | 'frozen' | 'blown'>>,
  ): Victim {
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
    hands?: Hands,
  ) {
    this.#ownHands = hands;
    this.#dashTrail = new DashTrail(scene, color(colour));
    this.#swoosh.visible = false;
    this.#swoosh.renderOrder = 1;
    scene.add(this.#swoosh);
    this.#texture = atlas.clone();
    this.#texture.repeat.set(1 / 16, 1 / 2);
    this.#texture.needsUpdate = true;
    const look = new THREE.SpriteMaterial({
      map: this.#texture,
      transparent: true,
      alphaTest: 0.05,
    });
    // frozen (ICE_BOOMERANG): the whole body recoloured blue, keeping only its own light and shade (the HQ: the sushi's black
    // nori and the eggplant's purple both turn the same blue, 6:41.8, 6:55.83)
    const recolour = this.#recolour;
    look.onBeforeCompile = (shader) => {
      shader.uniforms['recolour'] = recolour.colour;
      shader.uniforms['recolourAmount'] = recolour.amount;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'uniform vec3 recolour;\nuniform float recolourAmount;\nvoid main() {',
        )
        .replace(
          '#include <map_fragment>',
          [
            '#include <map_fragment>',
            'float recolourLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
            'diffuseColor.rgb = mix(diffuseColor.rgb, recolour * (0.55 + 0.75 * recolourLum), recolourAmount);',
          ].join('\n'),
        );
    };
    this.sprite = new THREE.Sprite(look);
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
    // two concentric rings on each hand (the burger calling, ss02): inner ≈ 3 hand widths across, outer ≈ 5.4
    this.#hands = [0, 0, 1, 1].map((_hand, k) => {
      const outerRing = k % 2 === 1;
      const hand = new THREE.Mesh(
        new THREE.RingGeometry(outerRing ? 0.95 : 0.9, 1, 48),
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
    // a translucent pale-cyan cube with rounded edges, lighter on top (the HQ's: ff physics hq 2.mp4 6:41.8-6:46.9,
    // foomerang-fu physics hq.mp4 6:55.83-6:57.62; iceLook.ts), standing on the feet: a unit cube, scaled to the body
    this.#ice = new THREE.Mesh(
      iceBlockGeometry(),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        vertexColors: true,
        transparent: true,
        opacity: ICE_LOOK.blockOpacity,
        depthWrite: false,
      }),
    );
    this.#ice.renderOrder = CHARACTER_RENDER_ORDER + 1;
    this.#ice.visible = false;
    this.#bubble = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: bubbleTexture(), transparent: true, depthWrite: false }),
    );
    this.#bubble.renderOrder = CHARACTER_RENDER_ORDER + 1;
    this.#bubble.visible = false;
    scene.add(this.#bubble);
    this.#flames = Array.from({ length: FIRE_MOTION.balls }, () => {
      const m = new THREE.Mesh(
        // (the HQ's fire balls are faceted, as the fire it lays on the ground: groundMarks.ts)
        new THREE.IcosahedronGeometry(0.5, 0),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
      );
      m.renderOrder = CHARACTER_RENDER_ORDER + 1;
      m.visible = false;
      scene.add(m);
      return m;
    });
    scene.add(
      this.sprite,
      this.#ring,
      this.#shadow,
      this.#arrow,
      this.#landRing,
      this.#ice,
      ...this.#hands,
    );
    this.#aim = new AimChevron(scene);
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
    if (this.#last !== undefined && speed > 1) {
      // which way it moves on screen (world +x is screen right): -1 left … 1 right
      const dx = c.x - this.#last.x;
      this.#moving = dx / (Math.hypot(dx, c.y - this.#last.y) || 1);
    }
    this.#last = { x: c.x, y: c.y, t: now };
    // calling a boomerang home it stands facing the camera (the banana at 0:18.5), whatever way it faced
    const falling =
      c.dead && this.#fellAt !== undefined ? fallPose((now - this.#fellAt) / 1000) : undefined;
    // falling it turns to face the camera (the HQ videos: the eggplant 5:03.87, the sushi 7:59.5)
    const f =
      c.calling === true || falling !== undefined
        ? { x: 0, y: 1 }
        : (c.dashing?.direction ?? c.facing);
    if (f !== undefined && Math.hypot(f.x, f.y) > 1e-6) this.#heading = headingFrame(f.x, f.y);
    const airborne = c.dashing !== undefined || c.dead;
    this.#texture.offset.set(this.#heading / 16, airborne ? 0 : 0.5);
    // the same size on screen as the 2D plaza drew it, and the reference characters' hop while running
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    const at = new THREE.Vector3(g.x, g.y, g.z);
    const distance = at.clone().sub(cam.position).dot(forward);
    const h = characterHeight(config, this.cell, scale, distance);
    // walking (render/walkMotion.ts): a hop and a rock each step, the hands swinging in turn, leaning into the move
    const pace = c.dead || airborne ? 0 : Math.min(1, speed / WALK_SPEED);
    const walk = walkPose(now / 1000, pace);
    const hop = walk.hop * BODY_OF_CELL * this.cell;
    this.#walk = { pose: walk, pace, toward: this.#moving };
    const body = h * BODY_OF_CELL;
    this.sprite.position.copy(at);
    if (falling !== undefined) {
      this.sprite.position.y += falling.lift * body;
      at.y += falling.lift * body;
    }
    let drawn = h;
    if (this.standPull > 0) {
      const toCamera = cam.position.clone().sub(this.sprite.position);
      const far = toCamera.length();
      this.sprite.position.addScaledVector(toCamera, this.standPull / far);
      drawn = (h * (far - this.standPull)) / far;
    }
    this.sprite.scale.set(drawn, drawn, 1);
    this.sprite.center.set(this.anchor[0] / this.cell, 1 - (this.anchor[1] + hop) / this.cell);
    const r = space.length(c.radius);
    this.#ring.position.set(g.x, 0.08, g.z);
    this.#ring.scale.set(r, 1, r);
    (this.#ring.material as THREE.MeshBasicMaterial).color = color(c.color);
    this.#shadow.position.set(g.x + 0.15, 0.06, g.z + 0.1);
    this.#shadow.scale.set(r * 0.85, 1, r * 0.55);
    if (c.dead) this.#deadAt ??= now;
    else {
      this.#deadAt = undefined;
      this.#fellAt = undefined;
    }
    // dead, it is gone at once: its remains (halves, or shards and a puddle) take its place (deathRemains.ts); fallen, it
    // is seen dropping away until it is out of sight
    const fade = this.#deadAt === undefined || falling?.visible === true ? 1 : 0;
    const a = (c.dimmed && !c.dead ? 0.5 : 1) * fade;
    (this.sprite.material as THREE.SpriteMaterial).opacity = a;
    this.#warn(c, cam, space, h, now);
    this.#frozen(c, at, h, now);
    this.#burn(c, at, h, now);
    this.#shield(c, at, h);
    // charging a throw: the arrowhead ahead of it, sliding out as the charge builds (render/aimLook.ts)
    if (c.aim !== undefined && c.facing !== undefined && !c.dead)
      this.#aim.show(
        { x: g.x, z: g.z },
        c.facing,
        c.aim.power,
        color(this.colour),
        space.length(1),
      );
    else this.#aim.hide();
    (this.#shadow.material as THREE.MeshBasicMaterial).opacity =
      falling !== undefined ? 0 : 0.3 * a;
    (this.#ring.material as THREE.MeshBasicMaterial).opacity = c.dead ? 0 : 0.85 * a;
    this.#land(landing, at, h);
    // the walk's tilt, about its feet: the rock, and the lean into its move (its screen-right component)
    const tiltAngle = -(this.#walk.pose.rock + WALK.lean * this.#walk.pace * this.#walk.toward);
    (this.sprite.material as THREE.SpriteMaterial).rotation += tiltAngle;
    // its hands, where its body's frame has them, rising with its hop (atlas px -> scene: h / cell)
    this.#ownHands?.place(
      at,
      this.#heading,
      airborne,
      (hop * h) / this.cell,
      a,
      (this.#heading * Math.PI) / 8,
      falling !== undefined ? this.#flail(falling.arms, body) : this.#handMotion(c, h),
      c.armed && !c.dead,
      c.aim !== undefined && !c.dead ? c.aim.power : 0,
      { axis: cam.getWorldDirection(new THREE.Vector3()).negate(), angle: tiltAngle },
      this.#swing(c, h, at),
    );
    this.#handAura(c, cam, at, h, now);
    // dashing: its afterimages, at its middle
    const middle = at.clone().add(new THREE.Vector3(0, 0.45 * h * BODY_OF_CELL, 0));
    this.#dashTrail.update(c.dashing !== undefined && !c.dead, middle, h * BODY_OF_CELL, cam, now);
  }

  /**
   * Swinging (render/slashMotion.ts, the mug at 0:39.93–40.30): its boomerang hand goes from its right side across the front to
   * the other, ≈ 0.6 of its body's height out and ≈ 0.3 up; the white crescent sweeps round the front at its feet with it.
   * Returns where the hand is (scene, from its feet), or undefined when it is not swinging.
   */
  #swing(c: CircleView, h: number, feet: THREE.Vector3): SceneOffset | undefined {
    const material = this.#swoosh.material as THREE.MeshBasicMaterial;
    if (c.slash === undefined || c.dead) {
      this.#swoosh.visible = false;
      return undefined;
    }
    const body = h * BODY_OF_CELL;
    // world angles (x right, y towards us); its right side is its facing turned +90°
    const dir = Math.atan2(c.slash.direction.y, c.slash.direction.x);
    const a = dir - swingAngle(c.slash.phase, c.slash.progress);
    const grip = { x: Math.cos(a) * 0.6 * body, y: 0.3 * body, z: Math.sin(a) * 0.6 * body };
    const sw = swoosh(c.slash.phase, c.slash.progress);
    this.#swoosh.visible = sw.opacity > 0;
    if (sw.opacity > 0) {
      const start = dir + SLASH_LOOK.sweep / 2;
      // its outer edge ≈ a body width out (≈ 1.15 of its height: 80 u against ≈ 70 u)
      const outer = body * (SLASH_LOOK.outer / 70);
      this.#swoosh.geometry.dispose();
      // (a ring in x/y laid flat: its angle θ lands at world angle -θ)
      this.#swoosh.geometry = new THREE.RingGeometry(
        (SLASH_LOOK.inner / SLASH_LOOK.outer) * outer,
        outer,
        24,
        1,
        -start,
        sw.length,
      ).rotateX(-Math.PI / 2);
      this.#swoosh.position.set(feet.x, 0.12, feet.z);
      material.opacity = sw.opacity;
    }
    return grip;
  }

  /** Owning the Shield: a clear bubble round it (the video, 6:54.38). It pops on SHIELD_BLOCKED (#event). */
  #shield(c: CircleView, feet: THREE.Vector3, h: number): void {
    const on = !c.dead && c.powers.includes('SHIELD');
    this.#bubble.visible = on;
    if (!on) return;
    const body = h * BODY_OF_CELL;
    this.#bubble.position.set(feet.x, feet.y + SHIELD_LOOK.centre * body, feet.z);
    this.#bubble.scale.setScalar(SHIELD_LOOK.diameter * body);
  }

  /**
   * Its hands' motion from where the bake had them (`h`: its cell's height, scene). Charging a throw, its boomerang hand draws
   * back behind its body and a little up, by up to ≈ 0.45 of its body's height (the donut at 2:00.6–2:01.47: render/aimLook.ts);
   * walking, its hands swing in turn (render/walkMotion.ts).
   */
  /** Falling: its arms out to each side and waving up and down, as the video's (the sushi, 7:59.5–8:00.0). */
  #flail(arms: number, body: number): readonly [SceneOffset, SceneOffset] {
    const out = 0.35 * body;
    const up = (0.35 + 0.25 * arms) * body;
    return [
      { x: -out, y: up, z: 0 },
      { x: out, y: -0.25 * arms * body + 0.35 * body, z: 0 },
    ];
  }

  #handMotion(c: CircleView, h: number): readonly [SceneOffset, SceneOffset] {
    const none = { x: 0, y: 0, z: 0 };
    if (c.facing === undefined || c.dead) return [none, none];
    const l = Math.hypot(c.facing.x, c.facing.y) || 1;
    // world +y is scene +z
    const fx = c.facing.x / l;
    const fz = c.facing.y / l;
    const body = h * BODY_OF_CELL;
    if (c.aim !== undefined) {
      const k = windUp(c.aim.power) * 0.45 * body;
      return [{ x: -fx * k, y: 0.3 * k, z: -fz * k }, none];
    }
    // walking: the hands swing forward and back in turn, ≈ 0.15 of its body's height each way
    const s = this.#walk.pose.swing * 0.15 * body;
    return [
      { x: fx * s, y: 0, z: fz * s },
      { x: -fx * s, y: 0, z: -fz * s },
    ];
  }

  /** Burning (FIRE_BOOMERANG): its own colours, with a column of fire balls climbing it (the video, 9:55.9–9:57.6). */
  #burn(c: CircleView, feet: THREE.Vector3, h: number, now: number): void {
    const on = c.burning === true && !c.dead;
    if (!c.dead) this.wasBurning = on;
    if (on) this.#burningAt ??= now;
    else this.#burningAt = undefined;
    const body = h * BODY_OF_CELL;
    const w = body; // the characters are about as wide as tall
    this.#flames.forEach((m, i) => {
      m.visible = on;
      if (!on) return;
      const b = flameBall(i, (now - (this.#burningAt as number)) / 1000);
      m.position.set(feet.x + b.side * w, feet.y + b.height * body, feet.z + 0.05 * w);
      m.scale.setScalar(b.size * w);
      (m.material as THREE.MeshBasicMaterial).color.set(b.colour);
    });
  }

  /** Frozen (ICE_BOOMERANG): blue inside a pale block of ice standing on its feet (the video, 6:54.55–6:56.38). */
  #frozen(c: CircleView, feet: THREE.Vector3, h: number, now: number): void {
    const on = c.frozen === true && !c.dead;
    if (!c.dead) this.wasFrozen = on;
    if (on) this.#frozenAt ??= now;
    else if (this.#frozenAt !== undefined) {
      this.#frozenAt = undefined;
      this.#thawedAt = c.dead ? undefined : now;
    }
    if (!on) {
      this.#ice.visible = false;
      // just thawed: the blue lifts over 0.1 s (iceMotion.ts)
      const thaw =
        this.#thawedAt === undefined ? undefined : thawBody((now - this.#thawedAt) / 1000);
      if (thaw === undefined) {
        this.#thawedAt = undefined;
        this.#recolour.amount.value = 0;
      } else {
        this.#recolour.colour.value.set(thaw.colour);
        this.#recolour.amount.value = thaw.amount;
      }
      this.#ownHands?.tint(this.#recolour.colour.value, this.#recolour.amount.value);
      return;
    }
    // the cold hits first (dark blue), then the block grows round it and it brightens to ice-blue (6:54.53–6:54.68)
    const t = (now - (this.#frozenAt as number)) / 1000;
    this.#recolour.colour.value.set(freezeBody(t));
    this.#recolour.amount.value = 1;
    this.#ownHands?.tint(this.#recolour.colour.value, 1);
    const k = blockScale(t);
    this.#ice.visible = k > 0;
    // (in character widths: the drawn character, not its sprite's cell)
    const w = this.effects?.w ?? h * BODY_OF_CELL;
    this.#ice.position.copy(feet);
    const bw = w * ICE_LOOK.blockWidth * k;
    const bh = w * ICE_LOOK.blockHeight * k;
    this.#ice.scale.set(bw, bh, bw * ICE_LOOK.blockDepth);
    this.#ice.position.y += bh / 2;
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
    // as the boomerang's: fading in from a little larger, then lit for as long as the call lasts (render/callAura.ts)
    const aura = auraIn((now - this.#callingAt) / 1000);
    const body = h * BODY_OF_CELL;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const own = this.#ownHands;
    // centred on each hand (its own, drawn by the game; else where the baked ones are), facing the camera
    const handSize = own?.size ?? body * 0.2;
    this.#hands.forEach((ring, k) => {
      const which = k < 2 ? 0 : 1;
      if (own !== undefined) ring.position.copy(own.positionOf(which));
      else
        ring.position
          .copy(feet)
          .addScaledVector(right, (which === 0 ? -1 : 1) * body * 0.62)
          .addScaledVector(up, body * 0.36);
      ring.quaternion.copy(cam.quaternion);
      const across = k % 2 === 0 ? 3 : 5.4;
      ring.scale.setScalar(((handSize * across) / 2) * aura.scale);
      ring.visible = true;
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * aura.opacity;
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
    this.#ownHands?.destroy(scene);
    scene.remove(this.#swoosh);
    this.#dashTrail.destroy(scene);
    this.#swoosh.geometry.dispose();
    this.#texture.dispose();
  }
}

/**
 * The boomerang as the reference video draws it (render/boomerangLook.ts): lying still, a flat V in its thrower's colour with
 * a lighter rim; in flight, the pale disc its spin makes, with a rim and a dot in that colour; behind every throw, its trail.
 */
class Boomerang {
  readonly group = new THREE.Group();
  /** Its shape (lying, falling or flying) and, in flight, the fading copies that trail its spin. */
  readonly #still = new THREE.Group();
  readonly #disc = new THREE.Group();
  readonly #shadow: THREE.Mesh;
  logical = { x: 0, y: 0 };
  #spentAt: number | undefined;
  #spent = false;
  readonly #trail: Trail;
  #state: BoomerangView['state'] = 'THROWN';
  #at = { x: 0, z: 0, flight: 0 };
  #groundedAt: number | undefined;
  /** How high its middle lies when it lies flat on the ground. */
  readonly #rest: number;
  /** Being called home: the video's flashing ring round it (render/callAura.ts). */
  readonly #aura: THREE.Mesh;
  /** The ring it lay in, left behind when it lifts (render/callAura.ts). */
  readonly #left: THREE.Mesh;
  #leftAt: number | undefined;
  #lastState: BoomerangView['state'] | undefined;
  #called = false;
  #calledAt: number | undefined;
  readonly #solid: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>;
  readonly #colour: THREE.Color;

  /**
   * `colour`: the thrower's character colour (owner, 2026-10-19). `unit`: one world unit in scene units (its sizes are the
   * video's, in world units, not its collision radius: that drew it twice too big).
   */
  constructor(scene: THREE.Scene, colour: string, unit: number, gradient: THREE.Texture) {
    const look = BOOMERANG_LOOK;
    const body = color(colour);
    // the store's full-HD shape (render/boomerangShape.ts), shaded as the plaza is: lying, flying and held alike
    const solid = boomerangBody(unit, body, gradient);
    this.#still.add(solid);
    this.#solid = solid;
    this.#colour = body;
    // in flight it spins too fast for the video's 30 frames a second to show its shape (a blur there): two fading copies
    // trail its turn
    for (const opacity of [0.35, 0.15]) {
      const ghost = boomerangBody(unit, body, gradient);
      ghost.material.opacity = opacity;
      ghost.material.depthWrite = false;
      ghost.castShadow = false;
      this.#disc.add(ghost);
    }
    this.group.add(this.#still, this.#disc);
    const r = (look.span / 2) * unit;
    this.#shadow = new THREE.Mesh(
      new THREE.CircleGeometry(r * 1.05, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x33402a,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    );
    // the aura: 1.5 of its length across (render/callAura.ts)
    const auraR = (CALL_AURA.ringOfBoomerang * look.span * unit) / 2;
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
    this.#left = this.#aura.clone();
    this.#left.material = (this.#aura.material as THREE.Material).clone();
    scene.add(this.group, this.#shadow, this.#aura, this.#left);
    this.#trail = new Trail(scene, look.trail.width * unit, body);
    const shape = boomerangGeometry(unit);
    shape.computeBoundingBox();
    this.#rest = shape.boundingBox?.max.y ?? unit;
  }

  /** An armed Explosive's tick: the boomerang itself turns pale white, as the video's does (render/explosiveTick.ts). */
  flash(on: boolean): void {
    const m = this.#solid.material;
    m.color.copy(on ? new THREE.Color(EXPLOSIVE_TICK.flash) : this.#colour);
    m.emissive.setScalar(on ? 0.6 : 0);
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
  }

  spin(time: number): void {
    // dropped (owner, 2026-10-19): it falls from its flight height under gravity (about 0.3 s), lands flat and lies still;
    // pulled home it flies at its height again, shaking until it arrives
    const { x, z, flight } = this.#at;
    // lifting out of where it lay to fly home: the ring it lay in stays there and comes apart (render/callAura.ts)
    if (this.#lastState === 'GROUNDED' && this.#state === 'RECALLING' && this.#aura.visible) {
      this.#leftAt = time;
      this.#left.position.copy(this.#aura.position);
    }
    this.#lastState = this.#state;
    if (this.#leftAt !== undefined) {
      const left = auraLeftBehind((time - this.#leftAt) / 1000);
      this.#left.visible = left.opacity > 0;
      (this.#left.material as THREE.MeshBasicMaterial).opacity = 0.9 * left.opacity;
      this.#left.scale.setScalar(left.scale);
      if (left.opacity <= 0) this.#leftAt = undefined;
    } else this.#left.visible = false;
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
      const aura = auraIn((time - this.#calledAt) / 1000);
      this.#aura.visible = true;
      (this.#aura.material as THREE.MeshBasicMaterial).opacity = 0.9 * aura.opacity;
      this.#aura.scale.setScalar(aura.scale);
      this.#aura.position.copy(this.group.position);
    } else {
      this.#calledAt = undefined;
      this.#aura.visible = false;
    }
    // in flight it is the disc its spin makes, and it leaves its trail (every throw, quick or charged); lying still, the V
    const flying = this.#state !== 'GROUNDED' && !this.#spent;
    this.#disc.visible = flying;
    // (its spin turns it backwards in time: the copies sit a little behind where it has just turned from)
    this.#disc.children.forEach((g, k) => (g.rotation.y = 0.35 * (k + 1)));
    if (flying) this.#trail.add(this.group.position, time);
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
    scene.remove(this.group, this.#shadow, this.#aura, this.#left);
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
  /** A character's hands' colour as drawn (its team's in Team Up), for its 3D remains. */
  #handColour(kind: PackCharacter, side: CircleView['side']): { handColour?: string } {
    const plain = parseHands(this.manifest.characters[kind]?.hands);
    if (plain === undefined) return {};
    return { handColour: side === undefined ? plain.colour : TEAM_HANDS[side] };
  }

  /** A character's own hands, holding its boomerang in its colour (render/three/hands.ts). */
  #handsFor(hands: CharacterHands, kind: PackCharacter, scale: number): Hands {
    const own = new Hands(this.scene, hands, scale, this.#gradient);
    const unit = this.#space.length(1);
    own.hold(
      boomerangBody(unit, color(CHARACTER_COLOURS[kind]), this.#gradient),
      BOOMERANG_LOOK.span,
      unit,
    );
    return own;
  }
  readonly #boomerangs = new Map<string, Boomerang>();
  readonly #books = new Map<number, THREE.Group>();
  /** Books just taken, shrinking away (render/pickupMotion.ts): no longer lying there. */
  readonly #takenBooks: { readonly book: THREE.Group; readonly at: number }[] = [];
  /** The reference video's own effects, cut out of it frame by frame (flipbooks.ts; public/vfx/). */
  readonly flipbooks: Flipbooks;
  /** Armed Explosives ticking where they landed: their bloom and their flash (render/explosiveTick.ts). */
  readonly #ticks = new Map<string, { bloom: THREE.Sprite; flash: THREE.Sprite }>();
  readonly #bursts: Burst[] = [];
  readonly #fadeable: { root: THREE.Object3D; materials: THREE.Material[]; opacity: number }[] = [];
  readonly #moving: { object: THREE.Object3D; motion: (t: number) => void }[] = [];
  readonly #waterField: THREE.Texture | null;
  /** A following camera's limits (a map with `followFrame`); the plaza's own when it is undefined. */
  #limits: FramingLimits | undefined;
  #pinnedCamera = false;
  /** The cross pond's raft (pond_cross: RAFT), turned by the rules' turntable angle each frame; null elsewhere. */
  readonly #raft: THREE.Object3D | null;
  /** Rocks that levers move (the glTF nodes SLIDER_<k>: the lily island's rock, the bridge islands' walls), each with where it stands at home. */
  readonly #sliders: { node: THREE.Object3D; index: number; home: THREE.Vector3 }[] = [];
  /** The warm-up's pen walls (PEN_<k>_wall<j>: rules slider 4k + j) and levers, and when each wall's lever was struck (penOpening.ts). */
  readonly #penWalls: {
    node: THREE.Object3D;
    index: number;
    pivot: THREE.Vector3;
    /** How far it sinks: its height and the moat's depth below the ground. */
    depth: number;
    materials: THREE.MeshBasicMaterial[];
    own: THREE.Color[];
  }[] = [];
  /** Each lever, its burst when struck (penBurst.ts) and its knob's vertices (taking the struck colour), their own colours. */
  readonly #penLevers: {
    node: THREE.Object3D;
    index: number;
    burst: PenBurst | null;
    knob: { colours: THREE.BufferAttribute; at: number[]; own: number[] } | null;
  }[] = [];
  readonly #penStruck = new Map<number, { at: number; colour: THREE.Color }>();
  readonly #banner: HTMLDivElement;
  /** READY / GO: the HQ video's own letters, its pop and GO's sparks (render/readyGo.ts). */
  readonly #word = readyGoOverlay();
  readonly #atlases = new Map<string, THREE.Texture>();
  /** Team Up: each character's atlas painted in a team's colours (teamRecolour.ts), made the first time a side needs it. */
  readonly #teamAtlases = new Map<string, THREE.Texture>();
  /** The side each drawn character was made for: a new match with other sides draws them again. */
  readonly #sideOf = new Map<string, 0 | 1 | undefined>();

  #teamAtlas(kind: PackCharacter, side: 0 | 1): THREE.Texture | undefined {
    const key = `${kind}:${side}`;
    const made = this.#teamAtlases.get(key);
    if (made !== undefined) return made;
    const source = this.#atlases.get(kind)?.image as
      (CanvasImageSource & { width: number; height: number }) | undefined;
    if (source === undefined) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return undefined;
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    recolourPixels(kind, side, pixels.data);
    context.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    this.#teamAtlases.set(key, texture);
    return texture;
  }
  /** The plaza's toon shading, for what the game draws itself (the characters' hands). */
  readonly #gradient = toonGradient();
  #view: ArenaView | undefined;
  #circles: DrawnCircle[] = [];
  #virtual: number | undefined;
  /** The camera's framing now (render/cameraFraming.ts), when it was last eased, and the resting view it crops. */
  #camera: CameraMotion = { frame: CAMERA_FRAMING.rest, velocity: { zoom: 0, u: 0, v: 0 } };
  /** Where the framing is headed (held while everyone stays well inside it). */
  #aim: CameraFrame = CAMERA_FRAMING.rest;
  #framedAt: number | undefined;
  readonly #restCamera = new THREE.PerspectiveCamera();
  #beams: ReturnType<typeof beamsOverlay> | null = null;
  readonly #props: PlazaProps;
  readonly #remains: DeathRemains;
  /** The characters in 3D, for their deaths (render/three/characterModels.ts), loaded as each first plays. */
  readonly #models = new CharacterModels(`${import.meta.env.BASE_URL}characters/3d/`);
  /** The ice blocks breaking: pieces thrown out (iceShards.ts). */
  readonly #shards: IceShards;
  readonly #blasts: Blasts;
  /** The hex plants (render/hexPlants.ts): pushed aside, springing back, burning; on every map they grow on (the meadow, the gong
   *  islands, the plaza), none elsewhere. */
  readonly #plants: HexPlantsView[];
  /** Fires set this step that last no longer than it (a blast's reach), for the plants. */
  #flashFires: FireSource[] = [];
  #lastBanner: string | undefined;
  /** Fire and ice left on the ground by fire / ice boomerangs and burning players (groundMarks.ts). */
  readonly #marks: GroundMarks;
  /** BATTLE_ROYALE: the border closing in (closingBorder.ts). */
  readonly #closing: ClosingBorder;
  #badges: PickupBadges | undefined;
  readonly #resize: ResizeObserver;
  /** Character.standPull for this map (0 but on 3D ground). */
  #standPull = 0;
  /** The gong islands' portals' "G" turning (render/three/portalSpin.ts); undefined: a map without portals. */
  #portalSpin: PortalSpin | undefined;
  /** When each portal (by its number) last had something cross it (view event PORTAL): it flashes from then. */
  readonly #portalCrossed = new Map<number, number>();

  constructor(
    readonly container: HTMLElement,
    readonly map: ReconstructedMap,
    readonly config: MapCameraConfig,
    readonly manifest: Manifest,
    readonly characterScale: number,
    gltf: THREE.Group,
    atlases: Map<string, THREE.Texture>,
    floor: {
      texture: THREE.Texture;
      extent: { x0: number; x1: number; y0: number; y1: number };
      water: THREE.Texture | null;
    },
  ) {
    this.#waterField = floor.water;
    // `?frame=hq` (a developer's check): the camera pinned to the HQ frame the map was built from, nothing following; `&fu=&fv=&fz=` nudge it
    const pinned =
      manifest.hqFrame !== undefined &&
      new URLSearchParams(globalThis.location?.search ?? '').get('frame') === 'hq';
    if (pinned && manifest.hqFrame !== undefined) {
      const q = new URLSearchParams(globalThis.location.search);
      const num = (k: string, d: number): number =>
        Number.isFinite(Number(q.get(k) ?? NaN)) ? Number(q.get(k)) : d;
      const f = {
        zoom: num('fz', manifest.hqFrame.zoom),
        u: num('fu', manifest.hqFrame.u),
        v: num('fv', manifest.hqFrame.v),
      };
      this.#camera = { frame: f, velocity: { zoom: 0, u: 0, v: 0 } };
      this.#pinnedCamera = true;
    } else if (manifest.fixedFrame !== undefined)
      this.#camera = { frame: manifest.fixedFrame, velocity: { zoom: 0, u: 0, v: 0 } };
    if (
      manifest.followFrame !== undefined &&
      manifest.fixedFrame !== undefined &&
      !this.#pinnedCamera
    )
      this.#limits = {
        minZoom: manifest.followFrame.minZoom,
        maxZoom: manifest.followFrame.maxZoom,
        rest: manifest.fixedFrame,
        clampToArt: false,
      };
    this.#raft = gltf.getObjectByName('RAFT') ?? null;
    gltf.traverse((o) => {
      const index = sliderNodeIndex(o.name);
      if (index !== null) this.#sliders.push({ node: o, index, home: o.position.clone() });
    });
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
    this.#restCamera.copy(this.camera);
    const look = parseSoftLook(manifest.look);
    this.#standPull = look === undefined ? 0 : STAND_PULL;
    this.#portalSpin = parsePortalSpin((manifest as { portals?: unknown }).portals);
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
    if (look !== undefined) softLights(this.scene, look);
    else
      this.scene.add(
        sun,
        sun.target,
        new THREE.AmbientLight(new THREE.Color(...SHADOW_TINT), Math.PI),
      );
    this.scene.add(gltf);
    // our vector floor (art/reconstruction/environ2/blender/floor_vector.py): one crisp flat-coloured ground, top-down
    for (const o of [...gltf.children]) if (/^(FLOOR|RUG)/.test(o.name)) o.removeFromParent();
    const backdrop = plazaFloor(floor.texture, floor.extent);
    this.scene.add(backdrop);
    if (look !== undefined) {
      // the HQ's mist is a gradient up the screen, not a floor: the sky behind everything (softLook.ts)
      this.scene.background = skyBackground(look);
      backdrop.visible = false;
    }
    const gradient = this.#gradient;
    gltf.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.name === 'FOUNTAIN_water') return;
      // (unlit stays unlit: the trees' canopies, flat-toned as the video's: art/.../plants.py; in a soft look, misted below
      // the tops as the rock is)
      if (o.material instanceof THREE.MeshBasicMaterial) {
        if (look !== undefined) o.material = mistedUnlit(o.material, look);
        return;
      }
      const m = o.material as THREE.MeshStandardMaterial;
      o.material =
        look !== undefined
          ? softMaterial(m, look)
          : new THREE.MeshToonMaterial({
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
    // objects that never move, fade or break into one; crates and pots (they break), the water and the portals (their swirl
    // plays, their ring moves, they flash) and the cross pond's raft (it turns) stay as they are
    this.#plants = parsePlantGroups((manifest as { plants?: unknown }).plants).map(
      (g) => new HexPlantsView(this.scene, g),
    );
    // the hex plants the game draws itself (hexPlants.ts; manifest `plants`): the model's own still copies go (`plantsReplace`: the
    // names of their nodes, a pattern from the map's own manifest, length-checked)
    const replace = (manifest as { plantsReplace?: unknown }).plantsReplace;
    if (
      typeof replace === 'string' &&
      replace.length > 0 &&
      replace.length < 80 &&
      this.#plants.length > 0
    ) {
      const pattern = new RegExp(replace);
      const gone: THREE.Object3D[] = [];
      gltf.traverse((o) => {
        if (pattern.test(o.name)) gone.push(o);
      });
      for (const o of gone) o.removeFromParent();
    }
    batchPlaza(gltf, (root) =>
      FADEABLE.test(root.name)
        ? 'own'
        : /^(CRATE|POT)_|^FOUNTAIN_water$|^FLOW_|^PORTAL_|^RAFT$|^SLIDER_|^PEN_/.test(root.name)
          ? 'leave'
          : 'shared',
    );
    // (a map whose HQ never turns its trees see-through keeps them solid: sceneryMotion.ts)
    const scenery = sceneryMotion(manifest);
    for (const root of gltf.children) {
      if (scenery.fade && FADEABLE.test(root.name)) {
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
    // the warm-up's pens (PEN_<k>_wall<j> is rules slider 4k + j): each wall sinks into the ground (penOpening.ts)
    for (const root of gltf.children) {
      const pen = /^PEN_(\d+)$/.exec(root.name);
      if (pen === null) continue;
      for (const node of [...root.children]) {
        // (the lever goes with its pen: the HQ's is gone with the walls)
        if (/^PEN_\d+_lever$/.test(node.name))
          this.#penLevers.push({ node, index: 4 * Number(pen[1]), ...this.#leverKnob(node) });
        const wall = /^PEN_\d+_wall(\d+)$/.exec(node.name);
        if (wall === null || !(node instanceof THREE.Mesh)) continue;
        const box = new THREE.Box3().setFromObject(node);
        const mid = box.getCenter(new THREE.Vector3());
        const pivot = new THREE.Vector3(mid.x, box.min.y, mid.z);
        pivotAt(node, pivot);
        const materials = (Array.isArray(node.material) ? node.material : [node.material]).map(
          (m) => {
            const c = (m as THREE.MeshBasicMaterial).clone();
            c.transparent = true;
            return c;
          },
        );
        node.material = materials.length === 1 ? (materials[0] as THREE.Material) : materials;
        this.#penWalls.push({
          node,
          index: 4 * Number(pen[1]) + Number(wall[1]),
          pivot,
          depth: (box.max.y - box.min.y) * 1.7,
          materials,
          own: materials.map((m) => m.color.clone()),
        });
      }
    }
    this.#props = new PlazaProps(this.scene, gltf, this.#space, gradient);
    this.#remains = new DeathRemains(this.scene, (u) => this.#space.length(u), {
      camera: this.camera,
      models: this.#models,
      gradient: this.#gradient,
    });
    this.#shards = new IceShards(this.scene);
    this.#blasts = new Blasts(this.scene);
    this.#marks = new GroundMarks(this.scene);
    this.#closing = new ClosingBorder(this.scene);
    this.flipbooks = new Flipbooks(this.scene);
    this.#animate(gltf, scenery.sway);
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
    container.appendChild(this.#word.root);
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

  /**
   * The plaza's own motion: pennants swing on the rope, canopies sway on their legs, the round tree breathes, water ripples. A map
   * whose scenery stands still (`sway` false: sceneryMotion.ts) keeps only its water.
   */
  #animate(gltf: THREE.Group, sway: boolean): void {
    const T = 4000;
    const wave = (amp: number, phase: number, t: number, speed = 1) =>
      amp * (Math.sin((2 * Math.PI * speed * t) / T + phase) - Math.sin(phase));
    const box = new THREE.Box3();
    let pennant = 0;
    for (const root of sway ? [...gltf.children] : []) {
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
      } else if (/^TUFT_\d+$/.test(root.name)) {
        // the lily island's grass tufts lean this way and that in a breeze (the HQ's grass is alive)
        box.setFromObject(root);
        const foot = box.getCenter(new THREE.Vector3());
        foot.y = box.min.y;
        pivotAt(root, foot);
        const k = this.#moving.length;
        this.#moving.push({
          object: root,
          motion: (t) => {
            root.rotation.x = wave(0.14, 0.8 * k, t, 1.6);
            root.rotation.z = wave(0.1, 0.8 * k + 1.1, t, 1.3);
          },
        });
      } else if (/^TREE_\d+_\d+$/.test(root.name)) {
        // a canopy lump of the lily island's birches swells and settles, each at its own beat
        box.setFromObject(root);
        pivotAt(root, box.getCenter(new THREE.Vector3()));
        const k = this.#moving.length;
        this.#moving.push({
          object: root,
          motion: (t) => {
            root.scale.setScalar(1 + wave(0.025, 0.7 * k, t, 0.8));
            root.rotation.y = wave(0.03, 0.5 * k, t, 0.6);
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
    // water: the video's, its glow along every edge and its foam drifting off them (waterShader.ts), when its field is in
    const water = gltf.getObjectByName('FOUNTAIN_water');
    if (water instanceof THREE.Mesh && this.#waterField !== null) {
      box.setFromObject(water);
      const c = box.getCenter(new THREE.Vector3());
      const material = waterMaterial(
        this.#waterField,
        { x: c.x, z: c.z, half: ((box.max.x - box.min.x) / 2) * WATER_FIELD.margin },
        WATER_FIELD.far,
        this.manifest.water,
      );
      water.material = material;
      this.#moving.push({
        object: water,
        motion: (t) => {
          (material.uniforms['time'] as { value: number }).value = t / 1000;
          // round whatever moves in the water (the cross pond's raft): its edge, where it is now
          const raft = this.#raft;
          const shape = this.manifest.water?.raft;
          if (raft !== null && shape !== undefined) {
            raft.updateWorldMatrix(true, false);
            const at = new THREE.Vector3().setFromMatrixPosition(raft.matrixWorld);
            const turn = new THREE.Euler().setFromRotationMatrix(raft.matrixWorld, 'YXZ').y;
            const k = new THREE.Vector3().setFromMatrixScale(raft.matrixWorld).x;
            (material.uniforms['raftAt'] as { value: THREE.Vector4 }).value.set(
              at.x,
              at.z,
              Math.cos(turn),
              Math.sin(turn),
            );
            (material.uniforms['raftHalf'] as { value: THREE.Vector2 }).value.set(
              shape.halfArm * k,
              shape.halfWidth * k,
            );
          }
        },
      });
    }
    // the canal court's waters: the tower's pool, the channel's run, the basin (canalWater.ts), each its own moving shader
    const canal = parseCanalWater(this.manifest);
    if (canal !== undefined)
      for (const kind of ['pool', 'run', 'basin'] as const) {
        const mesh = gltf.getObjectByName(`FLOW_${kind}`);
        if (!(mesh instanceof THREE.Mesh)) continue;
        // (its traced drawing beside the manifest, when the manifest has the art: the water stays procedural until it is in)
        const material = canalWaterMaterial(kind, canal);
        mesh.material = material;
        if (canal.art !== undefined)
          new THREE.TextureLoader().load(
            `${import.meta.env.BASE_URL}${this.map.assetDir}water_${kind}.png`,
            (t) => {
              t.colorSpace = THREE.NoColorSpace; // (its values the HQ's, as the palette's: no conversion)
              t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
              const traced = canalWaterMaterial(kind, canal, t);
              traced.uniforms['time'] = material.uniforms['time'] as THREE.IUniform;
              mesh.material = traced;
            },
          );
        this.#moving.push({
          object: mesh,
          motion: (t) => ((material.uniforms['time'] as { value: number }).value = t / 1000),
        });
      }
    // a map whose portals are traced frames (portalFlip.ts: the autumn glade): one mesh per frame, PORTAL_<k>_f<n>, shown in turn
    const flip = parsePortalFlip((this.manifest as { portalFlip?: unknown }).portalFlip);
    if (flip !== undefined)
      gltf.traverse((o) => {
        const part = portalFlipPart(o.name);
        if (part === undefined) return;
        const { portal, frame } = part;
        // its see-through part: the bright glow on the sand behind shows through its cyan, as the HQ's (measured: additive light
        // over that glow clips to white)
        if (part.glow && o instanceof THREE.Mesh) {
          const m = (o.material as THREE.Material).clone();
          m.transparent = true;
          m.opacity = 0.82;
          m.depthWrite = false;
          o.material = m;
          o.renderOrder = 2;
        }
        o.visible = frame === 0;
        this.#moving.push({
          object: o,
          motion: (t) => (o.visible = flipFrameAt(flip, portal, t) === frame),
        });
      });
    // the portals' swirl: played frame by frame from its atlas, the next frame fading in over the one shown (the HQ's is not
    // a rigid shape turning); without frames, the "G" turning in its face's plane (its local Y: the face's normal)
    const spin = this.#portalSpin;
    const frames = spin?.frames;
    if (spin !== undefined && frames !== undefined)
      gltf.traverse((o) => {
        const which = /^PORTAL_(\d+)_glyph(_next)?$/.exec(o.name);
        if (!(o instanceof THREE.Mesh) || which === null) return;
        const next = which[2] !== undefined;
        const lag = (spin.lags?.[Number(which[1])] ?? 0) * 1000; // (each portal runs its own clock behind: portalSpin.ts)
        const material = o.material as THREE.MeshBasicMaterial;
        if (material.map === null) return;
        const map = material.map.clone(); // (its own: each disc shows its own cell)
        material.map = map;
        if (next) {
          material.transparent = true;
          material.depthWrite = false;
        }
        const show = (cell: number) =>
          map.offset.set(
            (cell % frames.columns) / frames.columns,
            Math.floor(cell / frames.columns) / frames.rows,
          );
        this.#moving.push({
          object: o,
          motion: (t) => {
            const f = frameAt(spin, t - lag);
            if (f === undefined) return;
            show(next ? f.to : f.from);
            if (next) material.opacity = f.mix;
          },
        });
      });
    else if (spin !== undefined)
      gltf.traverse((o) => {
        if (!/^PORTAL_\d+_glyph$/.test(o.name)) return;
        const rest = o.quaternion.clone();
        const turn = new THREE.Quaternion();
        const axis = new THREE.Vector3(0, 1, 0);
        this.#moving.push({
          object: o,
          motion: (t) => {
            o.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis, spinAt(spin, t)));
          },
        });
      });
    // their flash when something crosses (view event PORTAL): every part but the rock's navy goes to the flash colours, the
    // lighter parts to the face's, the darker to the swirl's, at once, and back over flash_seconds (portalSpin.ts flashAt)
    const flashes = spin?.flashes;
    if (spin !== undefined && flashes !== undefined) {
      const strength = new Map<number, { value: number }>();
      gltf.traverse((o) => {
        const which = /^PORTAL_(\d+)(_glyph|_glyph_next|_ring|_rim|_rim_outer|_sides)?$/.exec(
          o.name,
        );
        const k = which === null ? undefined : Number(which[1]);
        const colours = k === undefined ? undefined : flashes[k];
        if (!(o instanceof THREE.Mesh) || k === undefined || colours === undefined) return;
        const material = o.material as THREE.MeshBasicMaterial;
        const flash = strength.get(k) ?? { value: 0 };
        if (!strength.has(k)) {
          strength.set(k, flash);
          this.#moving.push({
            object: o,
            motion: (t) => {
              flash.value = flashAt(spin, this.#portalCrossed.get(k), t);
            },
          });
        }
        const before = material.onBeforeCompile.bind(material);
        material.onBeforeCompile = (shader, renderer) => {
          before(shader, renderer);
          shader.uniforms['portalFlash'] = flash;
          shader.uniforms['flashFace'] = { value: new THREE.Color(colours[0]) };
          shader.uniforms['flashSwirl'] = { value: new THREE.Color(colours[1]) };
          shader.fragmentShader = shader.fragmentShader
            .replace(
              'void main() {',
              'uniform float portalFlash;\nuniform vec3 flashFace;\nuniform vec3 flashSwirl;\nvoid main() {',
            )
            .replace(
              '#include <color_fragment>',
              [
                '#include <color_fragment>',
                'float portalLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
                'vec3 portalTo = mix(flashSwirl, flashFace, smoothstep(0.17, 0.32, portalLum));',
                'diffuseColor.rgb = mix(diffuseColor.rgb, portalTo, portalFlash);',
              ].join('\n'),
            );
        };
        material.customProgramCacheKey = () => `portal-flash-${o.name}`;
        material.needsUpdate = true;
      });
    }
    // their rings, out along the face's normal (the ring's local Y) and up, fading; built where they rest at the curve's start
    if (spin?.ring !== undefined) {
      const first = spin.ring[0];
      gltf.traverse((o) => {
        const which = /^PORTAL_(\d+)_ring$/.exec(o.name);
        if (!(o instanceof THREE.Mesh) || which === null || first === undefined) return;
        const lag = (spin.lags?.[Number(which[1])] ?? 0) * 1000;
        const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
        const origin = o.position
          .clone()
          .addScaledVector(normal, -first[1])
          .add(new THREE.Vector3(0, -first[2], 0));
        const material = o.material as THREE.MeshBasicMaterial;
        material.transparent = true;
        material.depthWrite = false;
        this.#moving.push({
          object: o,
          motion: (t) => {
            const r = ringAt(spin, t - lag);
            if (r === undefined) return;
            o.position.copy(origin).addScaledVector(normal, r.out);
            o.position.y += r.up;
            material.opacity = r.opacity;
            o.visible = r.opacity > 0.01;
          },
        });
      });
    }
  }

  show(given: ArenaView): void {
    const view = isBareFrame(globalThis.location?.search ?? '') ? withoutActors(given) : given;
    this.#view = view;
    // the raft turns by the rules' angle (clockwise on screen when positive): about the scene's up, the other way round (scene z is the rules' y)
    const turned = view.turntables?.[0];
    if (this.#raft !== null && turned !== undefined) this.#raft.rotation.set(0, -turned, 0);
    // the lever-driven rock rides its rails by the rules' progress (sliders.ts): its node moves by the run, in scene units
    for (const s of this.#sliders) {
      const slid = view.sliders?.[s.index];
      if (slid === undefined) continue;
      const d = sliderOffset(slid, (x, y) => this.#space.toScene(x, y));
      s.node.position.set(s.home.x + d.x, s.home.y, s.home.z + d.z);
    }
    const now = this.#virtual ?? performance.now();
    // the pens: a wall whose lever was struck starts opening now (a new round's walls stand again)
    for (const w of this.#penWalls) {
      const by = view.sliders?.[w.index]?.droppedBy;
      if (by === undefined) this.#penStruck.delete(w.index);
      else if (!this.#penStruck.has(w.index))
        this.#penStruck.set(w.index, {
          at: now,
          colour: new THREE.Color().setRGB(...penTintFactor(by), THREE.SRGBColorSpace),
        });
    }
    const present = new Set<string>();
    this.#circles = [];
    const scale = this.characterScale;
    for (const c of view.circles) {
      present.add(c.id);
      let ch = this.#characters.get(c.id);
      if (ch !== undefined && this.#sideOf.get(c.id) !== c.side) {
        // another side than it was drawn for (a new match): drawn again in the right colours
        ch.destroy(this.scene);
        this.#characters.delete(c.id);
        this.#kinds.delete(c.id);
        ch = undefined;
      }
      if (ch === undefined) {
        const kind = characterOf(this.map.roster, c, this.#hasArt);
        this.#models.preload([kind]);
        const meta = this.manifest.characters[kind];
        const atlas =
          c.side === undefined
            ? this.#atlases.get(kind)
            : (this.#teamAtlas(kind, c.side) ?? this.#atlases.get(kind));
        if (meta === undefined || atlas === undefined) continue;
        this.#sideOf.set(c.id, c.side);
        const plain = parseHands(meta.hands);
        const hands =
          plain === undefined || c.side === undefined
            ? plain
            : { ...plain, colour: TEAM_HANDS[c.side] };
        ch = new Character(
          this.scene,
          atlas,
          meta.cell,
          meta.anchor,
          CHARACTER_COLOURS[kind],
          hands === undefined ? undefined : this.#handsFor(hands, kind, scale),
        );
        ch.standPull = this.#standPull;
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
    // the dead's pieces where the rules have them: solid, shoved about by the living (rules/remains.ts)
    this.#remains.place(
      new Map(
        (view.remains ?? []).map((r) => {
          const at = this.#space.toScene(r.x, r.y);
          return [r.id, new THREE.Vector3(at.x, 0, at.z)] as const;
        }),
      ),
    );
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
          this.#space.length(1),
          this.#gradient,
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
        // taken: it shrinks away where it stood (the video, 4:04.0–4:04.15)
        this.#takenBooks.push({ book, at: now });
        this.#books.delete(id);
      }
    this.#props.show(view, now);
    this.#closing.show(view.closing, (x, y) => this.#space.toScene(x, y));
    for (const e of view.events) this.#event(e, now);
    // a new round grows the plants back
    if (view.banner === 'READY' && this.#lastBanner !== 'READY')
      for (const p of this.#plants) p.reset();
    this.#lastBanner = view.banner;
    const word = view.banner === 'READY' || view.banner === 'GO' ? view.banner : undefined;
    this.#word.show(word, view.bannerAge ?? 1, this.renderer.domElement);
    this.#banner.textContent = word === undefined ? (view.banner ?? '') : '';
    this.#banner.style.display = view.banner === undefined || word !== undefined ? 'none' : 'block';
  }

  #event(e: ViewEvent, now: number): void {
    const at = this.#space.toScene(e.x, e.y, 30);
    const tint = color(e.color);
    const add = (object: THREE.Object3D, life: number, grow: number) => {
      object.position.set(at.x, at.y, at.z);
      this.scene.add(object);
      this.#bursts.push({ object, born: now, life, grow });
    };
    if (e.type === 'PORTAL') {
      // a crossing: both its portals flash (their #animate motion reads when)
      for (const id of e.portals ?? [])
        this.#portalCrossed.set(Number(id.replace('PORTAL_', '')), now);
      return;
    }
    if (e.type === 'HIT' && e.actor !== undefined && e.fell === true) {
      // it walked off the ground: no remains, it drops away whole (render/fallMotion.ts)
      this.#characters.get(e.actor)?.fall(now);
    } else if (e.type === 'HIT' && e.actor !== undefined) {
      // the victim comes apart across the line of the hit: halves (or, the mug, shards); the mug and the milk spill
      const ch = this.#characters.get(e.actor);
      const circle = this.#view?.circles.find((c) => c.id === e.actor);
      if (ch !== undefined && circle !== undefined) {
        const kind = characterOf(this.map.roster, circle, this.#hasArt);
        // burning when it died: it falls whole onto its side and smokes (deathRemains.ts)
        const victim = ch.victim(e.actor, {
          ...deathOf(kind),
          burnt: ch.wasBurning,
          kind,
          frozen: ch.wasFrozen,
          blown: e.blown === true,
          ...this.#handColour(kind, circle.side),
        });
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
      // the HQ video's blast, our own geometry (render/explosionMotion.ts, measured every frame at 5:22.47): its ring ends exactly at
      // the radius that kills
      if (e.radius !== undefined) {
        const ground = this.#space.toScene(e.x, e.y);
        this.#blasts.burst(
          new THREE.Vector3(ground.x, 0, ground.z),
          this.#space.length(e.radius),
          now,
        );
        // on foliage a blast sets alight everything it reaches (the reference: "an explosive's ring leaves a ring of fire")
        this.#flashFires.push({ x: ground.x, z: ground.z, radius: this.#space.length(e.radius) });
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
      // the video's own burst (4:04.01–4:04.48), in this power's colour, about a third of a body up where the Book was
      const ground = this.#space.toScene(e.x, e.y);
      const w = this.#space.length(DRAWN_CHARACTER_WIDTH);
      this.flipbooks.play(
        'pickup',
        new THREE.Vector3(ground.x, ground.y + 0.4 * w, ground.z),
        w,
        now,
        {
          tint: POWER_BADGE[e.kind].colour,
        },
      );
    } else if (e.type === 'SHIELD_BLOCKED') {
      // the video's own pop (8:54.19–8:54.26), half a body up round the player
      const w = this.#space.length(DRAWN_CHARACTER_WIDTH);
      const at = this.#space.toScene(e.x, e.y);
      this.flipbooks.play('shield_pop', new THREE.Vector3(at.x, at.y + 0.5 * w, at.z), w, now);
    } else if (e.type === 'SPLIT') {
      // the video's own flash where a Multi throw splits (5:51.61)
      const w = this.#space.length(DRAWN_CHARACTER_WIDTH);
      const at = this.#space.toScene(e.x, e.y, 30);
      this.flipbooks.play('split', new THREE.Vector3(at.x, at.y, at.z), w, now);
    } else if (e.type === 'THAWED') {
      // the ice breaks: pale cubes of it thrown out from where the block stood, falling and fading (the HQ: ff physics hq 2.mp4
      // 6:46.95-6:47.5, foomerang-fu physics hq.mp4 6:57.62)
      const w = this.#space.length(DRAWN_CHARACTER_WIDTH);
      const at = this.#space.toScene(e.x, e.y);
      this.#shards.burst(new THREE.Vector3(at.x, at.y, at.z), w, now);
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
   * The camera's framing (render/cameraFraming.ts, the reference video's camera on the plaza): every living player in view with
   * room round them, closing in as they draw together (between ≈ 0.85× and ≈ 1.3× environ2's frame); it holds still until it
   * has to move, then glides there on a spring. The camera itself never moves (no sideways follow: that fought the framing).
   * Applied as a crop of the resting view (a 2D zoom and pan, as the footage's is): the plaza's perspective never changes.
   */
  #frameCamera(time: number): void {
    const dt = this.#framedAt === undefined ? 0 : Math.min(0.1, (time - this.#framedAt) / 1000);
    this.#framedAt = time;
    // where the resting camera (no crop) shows each living player's middle
    const rest = this.#restCamera;
    rest.position.copy(this.camera.position);
    rest.quaternion.copy(this.camera.quaternion);
    rest.aspect = this.camera.aspect;
    rest.updateProjectionMatrix();
    rest.updateMatrixWorld();
    const points: { u: number; v: number }[] = [];
    for (const [id, ch] of this.#characters) {
      const c = this.#view?.circles.find((q) => q.id === id);
      if (c === undefined || c.dead) continue;
      const p = ch.sprite.position.clone();
      p.y += ch.sprite.scale.y * 0.16; // its middle: about half its body up
      p.project(rest);
      points.push({ u: p.x, v: p.y });
    }
    if (this.manifest.fixedFrame === undefined || this.#limits !== undefined) {
      this.#aim = frameTarget(points, this.#aim, this.#limits);
      this.#camera = springCamera(this.#camera, this.#aim, dt);
    }
    const { zoom, u, v } = this.#camera.frame;
    const W = 1000 * this.camera.aspect;
    const H = 1000;
    const w = W / zoom;
    const h = H / zoom;
    // a blast shakes the screen (explosionMotion.ts shakeAt: measured, at random each frame, up to 2% of its height)
    const shake = this.#blasts.shake(time);
    this.camera.setViewOffset(
      W,
      H,
      ((u + 1) / 2) * W - w / 2 + shake.x * h,
      ((1 - v) / 2) * H - h / 2 + shake.y * h,
      w,
      h,
    );
  }

  /** Fire and ice boomerangs in flight, and burning players, leave fire or ice on the ground behind them (groundMarks.ts). */
  #leaveMarks(time: number): void {
    const view = this.#view;
    if (view !== undefined) {
      const w = this.#space.length(DRAWN_CHARACTER_WIDTH); // one character width (groundMarkMotion.ts sizes are in widths)
      for (const b of view.boomerangs)
        if (b.mark !== undefined && b.state !== 'GROUNDED' && !b.spent) {
          const p = this.#space.toScene(b.x, b.y);
          this.#marks.drop(b.id, b.mark, p.x, p.z, w, time);
        }
      for (const c of view.circles)
        if (c.burning === true && !c.dead) {
          const p = this.#space.toScene(c.x, c.y);
          this.#marks.drop(`burn:${c.id}`, 'fire', p.x, p.z, w, time);
        }
      // running, everyone kicks up dust behind them (render/groundMarkMotion.ts)
      for (const c of view.circles)
        if (!c.dead && c.frozen !== true) {
          const p = this.#space.toScene(c.x, c.y);
          this.#marks.kick(c.id, p.x, p.z, w, time);
        }
    }
    this.#marks.update(time);
  }

  /**
   * The hex meadow's plants: every living player and every flying boomerang pushes them aside (its body and half a pad: the HQ's
   * gaps round them, 1204.75 / 1205.50); a flying fire boomerang, a burning player and a blast set them alight.
   */
  #movePlants(time: number): void {
    if (this.#plants.length === 0) return;
    const bodies: (Pusher & { readonly boomerang: boolean })[] = [];
    const fires: FireSource[] = this.#flashFires;
    this.#flashFires = [];
    for (const c of this.#view?.circles ?? []) {
      if (c.dead) continue;
      const p = this.#space.toScene(c.x, c.y);
      bodies.push({ x: p.x, z: p.z, radius: this.#space.length(c.radius), boomerang: false });
      if (c.burning === true) fires.push({ x: p.x, z: p.z, radius: this.#space.length(c.radius) });
    }
    for (const b of this.#view?.boomerangs ?? []) {
      if (b.spent || b.state === 'GROUNDED') continue;
      const p = this.#space.toScene(b.x, b.y);
      bodies.push({ x: p.x, z: p.z, radius: this.#space.length(b.radius), boomerang: true });
      if (b.mark === 'fire') fires.push({ x: p.x, z: p.z, radius: this.#space.length(b.radius) });
    }
    for (const plants of this.#plants) {
      // (a body shoves the pad tops it reaches, and half a pad more: a boomerang a little further, as it flings them)
      const half = plants.data.s * 0.8;
      const pushers = bodies.map((b) => ({
        x: b.x,
        z: b.z,
        radius: b.radius + half * (b.boomerang ? 1.4 : 1),
      }));
      plants.frame(time, pushers, fires);
    }
  }

  /**
   * A warm-up lever's knob (its cyan vertices, blender/build.py: a sphere 0.33 units round, 1.4 up): where it is, for its burst, and
   * which of the mesh's colours are its own, to take the struck colour.
   */
  #leverKnob(node: THREE.Object3D): {
    burst: PenBurst | null;
    knob: { colours: THREE.BufferAttribute; at: number[]; own: number[] } | null;
  } {
    const geometry = (node as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const colours = geometry?.getAttribute('color') as THREE.BufferAttribute | undefined;
    const positions = geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (colours === undefined || positions === undefined) return { burst: null, knob: null };
    node.updateWorldMatrix(true, false);
    const at: number[] = [];
    const own: number[] = [];
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < colours.count; i += 1) {
      const [r, g, b] = [colours.getX(i), colours.getY(i), colours.getZ(i)];
      if (!(b > 0.55 && g > 0.35 && r < 0.3)) continue;
      at.push(i);
      own.push(r, g, b);
      box.expandByPoint(v.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld));
    }
    if (at.length === 0) return { burst: null, knob: null };
    const size = box.getSize(new THREE.Vector3());
    const way = (x: number, y: number, z: number): THREE.Vector3 =>
      new THREE.Vector3(x, y, z).transformDirection(node.matrixWorld);
    const burst = new PenBurst(this.scene, {
      knob: box.getCenter(new THREE.Vector3()),
      unit: Math.max(size.x, size.z) / 0.66,
      east: way(1, 0, 0),
      north: way(0, 0, -1),
      up: way(0, 1, 0),
    });
    return { burst, knob: { colours, at, own } };
  }

  /**
   * The warm-up's pen walls: their lavender times a light version of the striker's colour, fading back part way, then sinking
   * straight down into the ground, the end walls first (render/penOpening.ts; owner, 2026-11-12: "it settles into the ground"), deep
   * enough to go under the moat's water where a wall bridges it. The lever goes with the long walls.
   */
  #openPens(time: number): void {
    const white = new THREE.Color(1, 1, 1);
    for (const w of this.#penWalls) {
      const struck = this.#penStruck.get(w.index);
      const pose = penWallAt(
        struck === undefined ? undefined : (time - struck.at) / 1000,
        w.index % 4 >= 2,
      );
      w.node.visible = pose.visible;
      w.node.position.y = w.pivot.y - pose.sink * w.depth;
      w.materials.forEach((m, k) => {
        m.color.copy(w.own[k] as THREE.Color);
        if (struck !== undefined) m.color.multiply(white.clone().lerp(struck.colour, pose.tint));
      });
    }
    // the lever: its knob takes the struck colour (the wall's lavender times it, the knob's own shading kept) and stays so; its chips
    // fly; it goes with the long walls
    for (const l of this.#penLevers) {
      const struck = this.#penStruck.get(l.index);
      const t = struck === undefined ? undefined : (time - struck.at) / 1000;
      l.node.visible = penWallAt(t, false).visible;
      const chips = PEN_WALL_TOP.clone().multiply(struck?.colour ?? white);
      l.burst?.frame(t, chips);
      const knob = l.knob;
      if (knob === null) continue;
      knob.at.forEach((i, k) => {
        const shade = (knob.own[3 * k + 1] as number) / KNOB_LIT;
        if (struck === undefined)
          knob.colours.setXYZ(
            i,
            knob.own[3 * k] as number,
            knob.own[3 * k + 1] as number,
            knob.own[3 * k + 2] as number,
          );
        else knob.colours.setXYZ(i, chips.r * shade, chips.g * shade, chips.b * shade);
      });
      knob.colours.needsUpdate = true;
    }
  }

  /** Every armed Explosive lying with its fuse burning blooms and flashes white, faster as it nears the blast. */
  #tick(): void {
    const ticking = new Set<string>();
    const w = this.#space.length(DRAWN_CHARACTER_WIDTH);
    for (const b of this.#view?.boomerangs ?? []) {
      if (b.fuse === undefined) continue;
      ticking.add(b.id);
      let t = this.#ticks.get(b.id);
      if (t === undefined) {
        const sprite = (colour: THREE.ColorRepresentation): THREE.Sprite => {
          const s = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: softDisc(),
              color: colour,
              transparent: true,
              depthWrite: false,
              depthTest: false,
            }),
          );
          s.renderOrder = 5;
          this.scene.add(s);
          return s;
        };
        t = { bloom: sprite(0xffffff), flash: sprite(EXPLOSIVE_TICK.flash) };
        this.#ticks.set(b.id, t);
      }
      const { bloom, flash } = tickAt(b.fuse);
      const at = this.#space.toScene(b.x, b.y, 8);
      t.bloom.position.copy(at);
      t.bloom.scale.setScalar(EXPLOSIVE_TICK.bloomWidths * w);
      t.bloom.material.opacity = bloom;
      t.bloom.visible = bloom > 0;
      // the boomerang itself turns white, a faint glow round it
      this.#boomerangs.get(b.id)?.flash(flash);
      t.flash.position.copy(at);
      t.flash.scale.setScalar(0.8 * w);
      t.flash.material.opacity = 0.35;
      t.flash.visible = flash;
    }
    for (const [id, t] of this.#ticks)
      if (!ticking.has(id)) {
        for (const s of [t.bloom, t.flash]) {
          this.scene.remove(s);
          s.material.dispose();
        }
        this.#ticks.delete(id);
      }
  }

  /**
   * `?deathlab` (a developer's check, as `?frame=hq`): every 2.5 s the first character's remains are made beside it (two widths to
   * its right, as if it died there, its hit coming from its left), so its sprite and its 3D cut can be looked at side by side; with
   * the camera pinned (`&frame=hq&fz=3`) they are made under the middle of the screen. `?deathlab=fire`, `=frozen`, `=blown` die
   * those ways; `&labkind=banana` makes it that character.
   */
  readonly #lab = new URLSearchParams(globalThis.location?.search ?? '').get('deathlab');
  #labAt = -Infinity;
  #deathLab(time: number): void {
    if (this.#lab === null || time - this.#labAt < 2500) return;
    const first = [...this.#characters.entries()][0];
    const kind = first === undefined ? undefined : this.#kinds.get(first[0]);
    if (first === undefined || kind === undefined) return;
    this.#labAt = time;
    const [id, ch] = first;
    const v = ch.victim(`lab:${id}`, {
      ...deathOf(kind),
      kind,
      burnt: this.#lab === 'fire',
      frozen: this.#lab === 'frozen',
      blown: this.#lab === 'blown',
      ...this.#handColour(kind as PackCharacter, undefined),
    });
    let at = v.at.clone().add(new THREE.Vector3(2 * v.bodyHeight, 0, 0));
    if (this.#pinnedCamera) {
      // the camera pinned (`&frame=hq&fz=…`): on the ground under the middle of the screen, to look at closely
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -v.at.y);
      at = ray.ray.intersectPlane(ground, new THREE.Vector3()) ?? at;
    }
    const other = new URLSearchParams(globalThis.location?.search ?? '').get(
      'labkind',
    ) as PackCharacter | null;
    const meta = other === null ? undefined : this.manifest.characters[other];
    // (a character not in play has no atlas loaded: the first one's then stands in, for its size only)
    const atlas = (other === null ? undefined : this.#atlases.get(other)) ?? v.atlas;
    if (other !== null && meta !== undefined) {
      this.#models.preload([other]);
      const own = atlas !== v.atlas;
      this.#remains.burst(
        {
          ...v,
          ...deathOf(other),
          at,
          kind: other,
          atlas,
          cell: own ? meta.cell : v.cell,
          anchor: own ? meta.anchor : v.anchor,
          colour: CHARACTER_COLOURS[other],
          spriteHeight: own ? (v.spriteHeight * meta.cell) / v.cell : v.spriteHeight,
          bodyHeight: own ? (v.bodyHeight * meta.cell) / v.cell : v.bodyHeight,
          ...this.#handColour(other, undefined),
        },
        { x: 1, z: 0 },
        time,
      );
      return;
    }
    this.#remains.burst({ ...v, at }, { x: 1, z: 0 }, time);
  }

  #frame(t: number): void {
    const time = this.#virtual ?? t;
    this.#frameCamera(time);
    for (const m of this.#moving) m.motion(time);
    for (const b of this.#boomerangs.values()) b.spin(time);
    this.#leaveMarks(time);
    this.#movePlants(time);
    this.#openPens(time);
    this.#tick();
    this.#props.frame(time);
    this.#deathLab(time);
    this.#remains.frame(time);
    this.#shards.frame(time);
    const w = this.#space.length(DRAWN_CHARACTER_WIDTH);
    for (const ch of this.#characters.values())
      if (ch.effects === undefined) ch.effects = { flipbooks: this.flipbooks, w };
    this.flipbooks.frame(time);
    for (let i = this.#takenBooks.length - 1; i >= 0; i -= 1) {
      const { book, at } = this.#takenBooks[i] as { book: THREE.Group; at: number };
      const k = bookScale((time - at) / 1000);
      if (k <= 0) {
        this.scene.remove(book);
        this.#takenBooks.splice(i, 1);
      } else book.scale.setScalar(k);
    }
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
    if (this.manifest.beams !== undefined) {
      this.#beams ??= beamsOverlay(this.manifest.beams);
      this.renderer.getDrawingBufferSize(this.#beams.resolution);
      const clear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.render(this.#beams.scene, this.#beams.camera);
      this.renderer.autoClear = clear;
    }
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
    this.#word.root.remove();
    for (const t of this.#atlases.values()) t.dispose();
    for (const t of this.#teamAtlases.values()) t.dispose();
  }
}

/** The flipbooks cut from the reference video (public/vfx/<name>.png + .json). */
const VFX_FLIPBOOKS = ['pickup', 'shield_pop', 'split'] as const; // (the blast is our own: blasts.ts)

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
      // with hands of its own (drawn by the game) its body comes from the hands-off atlas
      const file = c.body !== undefined && parseHands(c.hands) !== undefined ? c.body : c.file;
      if (!/^[A-Za-z0-9_-]{1,64}\.(webp|png)$/.test(file))
        throw new Error('plaza manifest: bad character file');
      if (manifest.assetsFrom !== undefined && !/^[a-z_]{1,32}$/.test(manifest.assetsFrom))
        throw new Error('plaza manifest: bad assetsFrom');
      // a map may share another's characters (the gong islands: the plaza's): its atlases come from that map's folder
      const from =
        manifest.assetsFrom === undefined
          ? at
          : `${import.meta.env.BASE_URL}maps/${manifest.assetsFrom}/`;
      const t = await loader.loadAsync(`${from}${file}`);
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
  // the water's field (art/physics_reference/water_field.py); without it the water is plain
  const water = await loader.loadAsync(`${at}water.png`).catch(() => null);
  if (water !== null) {
    water.flipY = false;
    water.wrapS = water.wrapT = THREE.RepeatWrapping;
  }
  const plaza = new Plaza(container, map, config, manifest, characterScale, gltf.scene, atlases, {
    texture: floorTexture,
    extent,
    water,
  });
  // the video's own effects (art/physics_reference/vfx_extract.py), loaded behind the plaza: until they are in, or if one is
  // missing, the drawn stand-ins play instead
  void plaza.flipbooks.load(`${import.meta.env.BASE_URL}vfx`, VFX_FLIPBOOKS);
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
