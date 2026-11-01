import * as THREE from 'three';
import { WATER_LOOK, waterGlsl, type WaterShape } from '../waterLook';

/**
 * A cartoon water, as the HQ draws the pond's (foomerang-fu physics hq.mp4 4:27, frames 0.1 s apart): the foam is a few brush-stroke
 * ribbons along each edge, tapered to a point where they end, with wavy outlines that keep changing, morphing from one drawing to the next (a "boil"), not
 * smooth lines sliding along. `fps`: how often the outlines are re-drawn; `wobble`: how far they wander (units); each ribbon: where
 * it lies off the edge, its greatest half-width, and how far its place sways; `glow`: the pale water along an edge.
 */
export interface CartoonWater {
  readonly fps: number;
  readonly wobble: number;
  /** The size of a ribbon's pieces and of its outline's waves: the field noise is looked up at this multiple of its own scale (smaller: longer pieces, gentler waves). */
  readonly scale: number;
  readonly wobbleScale: number;
  /** Where a ribbon exists along its edge: the pieces of noise above `from` begin to show and by `to` are at full width (higher: fewer, sparser ribbons). */
  readonly presence: readonly [number, number];
  /**
   * The foam round something moving in the water (the raft) against the banks' (the HQ, steady state: along the banks it is thin and
   * nearly still; round the raft almost none, short-lived streaks, 87% gone in 0.8 s): its ribbons' width as a multiple of the banks',
   * and how much higher the noise must be for one to show.
   */
  readonly raftFoam?: { readonly width: number; readonly presenceShift: number };
  /** How fast the ribbons drift and sway along their edges, a multiple of the base pace (art/pond_cross/water_pace.py found it). */
  readonly motion: number;
  readonly glow: number;
  readonly ribbons: readonly {
    readonly centre: number;
    readonly width: number;
    readonly sway: number;
  }[];
}

/** A water's own look: its three colours and, if it differs from the fountain's, the shape of its glow and foam. */
export type WaterStyle = {
  readonly base: string;
  readonly light: string;
  readonly foam: string;
  /**
   * Something that moves in this water, a cross of two planks (the cross pond's raft): the foam is the water's, so it gathers
   * round the thing wherever it is now, not round where it was baked. Half the arm's length and half its width, scene units.
   */
  readonly raft?: { readonly halfArm: number; readonly halfWidth: number };
  /** If present, the water is drawn as a cartoon (its ribbons), not by the fountain's smooth lines. */
  readonly cartoon?: CartoonWater;
  /**
   * Light shafts falling through the water (the lily island, the HQ 10:37): slanting bands that only brighten the WATER (an overlay on the
   * page tinted the land too). The band's coordinate runs across the screen at `angle` degrees (CSS convention) from 0 to 1; `stops` are
   * [position, strength] pairs (linear between them); `fade` the screen heights (0 top, 1 bottom) where they are full and gone.
   */
  /**
   * A map's own screen-space colour grade for its water (fitted to the HQ frame: art/<map>/grade.py): a grid of RGB offsets (0..255 scale, rows top to bottom,
   * columns left to right) interpolated over the canvas and added to the water's colour, so its haze and the tint of its light come out as the video's.
   */
  readonly grade?: {
    readonly cols: number;
    readonly rows: number;
    readonly offsets: readonly (readonly [number, number, number])[];
  };
  readonly shafts?: {
    readonly angle: number;
    readonly stops: readonly (readonly [number, number])[];
    readonly tint: string;
    readonly fade: readonly [number, number];
  };
} & Partial<WaterShape>;

/**
 * The fountain's water (render/waterLook.ts): environ2's blue, a pale glow along every edge, foam lines drifting away from the
 * wall and the island. `field` is art/physics_reference/water_field.py's bake (R: distance to the nearest edge, 0…`far`
 * units; G: the noise that breaks the lines) over the square `box` (centre x, z and half its side, scene units).
 * Flat, as the video's water is: its colours are written as they are. `colours`: a map's own (the manifest's `water`: the cross
 * pond's is duller than the fountain's); the fountain's by default.
 */
export function waterMaterial(
  field: THREE.Texture,
  box: { x: number; z: number; half: number },
  far: number,
  style: WaterStyle = WATER_LOOK,
): THREE.ShaderMaterial {
  const colours = style;
  const glsl = waterGlsl({ ...WATER_LOOK, ...style });
  // written as they are (sRGB, as the canvas shows them): read straight from the hex
  const rgb = (c: string) =>
    new THREE.Vector3(...[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255));
  const fragment =
    style.cartoon === undefined
      ? fountainFragment(glsl, far)
      : cartoonFragment(style.cartoon, far, style.shafts, style.grade);
  return new THREE.ShaderMaterial({
    uniforms: {
      field: { value: field },
      box: { value: new THREE.Vector3(box.x - box.half, box.z - box.half, 2 * box.half) },
      time: { value: 0 },
      // the moving raft: (x, z, cos, sin) of where it is and which way it faces, and its half sizes (0: none)
      raftAt: { value: new THREE.Vector4(0, 0, 1, 0) },
      raftHalf: { value: new THREE.Vector2(0, 0) },
      base: { value: rgb(colours.base) },
      light: { value: rgb(colours.light) },
      foam: { value: rgb(colours.foam) },
    },
    vertexShader: `varying vec2 at; varying vec2 ndc;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  at = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ndc = gl_Position.xy / gl_Position.w;
}`,
    fragmentShader: fragment,
  });
}

/** GLSL adding a map's colour grade (a bilinear grid of offsets over the canvas) to `col`. */
function gradeGlsl(g: NonNullable<WaterStyle['grade']>): string {
  const at = (r: number, c: number): string => {
    const o = g.offsets[
      Math.min(g.rows - 1, Math.max(0, r)) * g.cols + Math.min(g.cols - 1, Math.max(0, c))
    ] as readonly [number, number, number];
    return `vec3(${o.map((v) => (v / 255).toFixed(4)).join(', ')})`;
  };
  const rows = Array.from({ length: g.rows }, (_, r) => {
    const row = Array.from({ length: g.cols }, (_, c) => at(r, c)).join(', ');
    return `vec3 gr${r}[${g.cols}] = vec3[${g.cols}](${row});`;
  }).join('\n  ');
  return `  {
  ${rows}
    float gx = clamp((ndc.x + 1.0) * 0.5, 0.0, 1.0) * ${(g.cols - 1).toFixed(1)};
    float gy = clamp((1.0 - ndc.y) * 0.5, 0.0, 1.0) * ${(g.rows - 1).toFixed(1)};
    int x0 = int(min(floor(gx), ${(g.cols - 2).toFixed(1)}));
    int y0 = int(min(floor(gy), ${(g.rows - 2).toFixed(1)}));
    float fx = gx - float(x0);
    float fy = gy - float(y0);
    vec3 acc = vec3(0.0);
${Array.from({ length: g.rows - 1 }, (_, r) => `    if (y0 == ${r}) { vec3 top = mix(gr${r}[x0], gr${r}[x0 + 1], fx); vec3 bot = mix(gr${r + 1}[x0], gr${r + 1}[x0 + 1], fx); acc = mix(top, bot, fy); }`).join('\n')}
    col += acc;
  }
`;
}

/** GLSL adding a map's light shafts to `col` (waterShader `shafts`), from the fragment's place on the canvas (`ndc`). */
function shaftsGlsl(sh: NonNullable<WaterStyle['shafts']>): string {
  const a = (sh.angle * Math.PI) / 180;
  const stops = sh.stops;
  let prof = '0.0';
  for (let i = stops.length - 1; i > 0; i -= 1) {
    const [t0, v0] = stops[i - 1] as readonly [number, number];
    const [t1, v1] = stops[i] as readonly [number, number];
    prof = `(t < ${FLOAT(t1)} ? mix(${FLOAT(v0)}, ${FLOAT(v1)}, clamp((t - ${FLOAT(t0)}) / ${FLOAT(t1 - t0)}, 0.0, 1.0)) : ${prof})`;
  }
  const first = (stops[0] as readonly [number, number])[0];
  const tint = [1, 3, 5]
    .map((i) => (parseInt(sh.tint.slice(i, i + 2), 16) / 255).toFixed(4))
    .join(', ');
  return `  {
    vec2 px = vec2((ndc.x + 1.0) * 0.5 * 1920.0, (1.0 - ndc.y) * 0.5 * 1080.0);
    float t = ((px.x - 960.0) * ${FLOAT(Math.sin(a))} + (px.y - 540.0) * ${FLOAT(-Math.cos(a))}) / ${FLOAT(1920 * Math.abs(Math.sin(a)) + 1080 * Math.abs(Math.cos(a)))} + 0.5;
    float strength = t < ${FLOAT(first)} ? 0.0 : ${prof};
    float down = 1.0 - smoothstep(${FLOAT(sh.fade[0])}, ${FLOAT(sh.fade[1])}, (1.0 - ndc.y) * 0.5);
    col = mix(col, vec3(${tint}), strength * down);
  }
`;
}

const FLOAT = (x: number) => x.toFixed(4);

/** The fountain's water: glow along an edge, thin lines drifting off it, broken by the field's noise. */
function fountainFragment(glsl: string, far: number): string {
  return `uniform sampler2D field; uniform vec3 box; uniform float time; uniform vec3 base, light, foam; uniform vec4 raftAt; uniform vec2 raftHalf;
varying vec2 at; varying vec2 ndc;
float boxDistance(vec2 p, vec2 size) {
  vec2 a = abs(p) - size;
  return length(max(a, 0.0)) + min(max(a.x, a.y), 0.0);
}
${glsl}
void main() {
  vec2 uv = (at - box.xy) / box.z;
  float d = texture2D(field, uv).r * ${far.toFixed(3)};
  if (raftHalf.x > 0.0) {
    // the raft's two planks as they are now: the water's edge round them, like any edge, wherever they have turned to
    vec2 q = at - raftAt.xy;
    vec2 lp = vec2(q.x * raftAt.z - q.y * raftAt.w, q.x * raftAt.w + q.y * raftAt.z);
    d = min(d, max(min(boxDistance(lp, raftHalf), boxDistance(lp, raftHalf.yx)), 0.0));
  }
  float piece = texture2D(field, uv * 1.5 + vec2(time * 0.004, time * -0.003)).g;
  vec2 w = waterAt(d, piece, time);
  vec3 c = mix(base, light, w.x * 0.85);
  gl_FragColor = vec4(mix(c, foam, w.y * 0.9), 1.0);
}`;
}

/**
 * The cartoon water. The field gives the distance to the nearest edge (R), blobs (G: long pieces) and finer wobble (B). Each ribbon lies
 * a distance from the edge, swaying a little with its blob, as thick as its blob is strong (so it tapers to a point where the blob
 * falls away); its outline is pushed in and out by the fine noise, which is looked up somewhere new every 1/fps second: the outline
 * is re-drawn in steps, as the HQ's is, while the ribbons themselves drift slowly along the edge.
 */
function cartoonFragment(
  c: CartoonWater,
  far: number,
  shafts?: WaterStyle['shafts'],
  grade?: WaterStyle['grade'],
): string {
  const ribbons = c.ribbons
    .map((r, i) => {
      const k = i + 1;
      return `  {
    // where this ribbon is present: two draws of the blob noise, each at its own random place, eased from one to the next: the ribbon
    // fades in and out where it is, and does not slide along its edge
    vec2 at0 = uv * ${FLOAT(c.scale * (1 + 0.4667 * i))} + vec2(${FLOAT(0.31 * k)}, ${FLOAT(0.17 * k)});
    float nA = texture2D(field, at0 + vec2(hash(stepNo + ${FLOAT(17 * k)}), hash(stepNo + ${FLOAT(29 * k)}))).g;
    float nB = texture2D(field, at0 + vec2(hash(stepNo + ${FLOAT(18 * k)}), hash(stepNo + ${FLOAT(30 * k)}))).g;
    float n = mix(nA, nB, ease);
    float centre = ${FLOAT(r.centre)} + ${FLOAT(r.sway)} * sin(time * ${FLOAT((0.7 + 0.2 * i) * c.motion)} + n * 6.2832 + ${FLOAT(1.3 * i)});
    float reach = ${FLOAT(r.width)} * widthK * smoothstep(${FLOAT(c.presence[0])} + shift, ${FLOAT(c.presence[1])} + shift, n);
    amount = max(amount, 1.0 - smoothstep(reach * 0.6, reach, abs(dw - centre)));
  }`;
    })
    .join('\n');
  const raft = c.raftFoam ?? { width: 1, presenceShift: 0 };
  return `uniform sampler2D field; uniform vec3 box; uniform float time; uniform vec3 base, light, foam; uniform vec4 raftAt; uniform vec2 raftHalf;
varying vec2 at; varying vec2 ndc;
float boxDistance(vec2 p, vec2 size) {
  vec2 a = abs(p) - size;
  return length(max(a, 0.0)) + min(max(a.x, a.y), 0.0);
}
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
// the ribbons along an edge \`d\` away: \`widthK\` times as wide, needing the noise \`shift\` higher to show
float ribbons(vec2 uv, float d, float wobble, float stepNo, float ease, float widthK, float shift) {
  float dw = d + wobble * ${FLOAT(c.wobble)};
  float amount = 0.0;
${ribbons}
  return amount;
}
void main() {
  vec2 uv = (at - box.xy) / box.z;
  float dBank = texture2D(field, uv).r * ${far.toFixed(3)};
  // the outline's wobble: two draws of the fine noise, each looked up somewhere new at its step of the boil, morphed from one to the next
  float stepNo = floor(time * ${FLOAT(c.fps)});
  float into = fract(time * ${FLOAT(c.fps)});
  float ease = smoothstep(0.0, 1.0, into);
  float drawA = texture2D(field, uv * ${FLOAT(c.wobbleScale)} + vec2(hash(stepNo), hash(stepNo + 11.0))).b;
  float drawB = texture2D(field, uv * ${FLOAT(c.wobbleScale)} + vec2(hash(stepNo + 1.0), hash(stepNo + 12.0))).b;
  float wobble = mix(drawA, drawB, ease) - 0.5;      // (large and slow: a gentle wave, not a scribble)
  float foamAmount = ribbons(uv, dBank, wobble, stepNo, ease, 1.0, 0.0);
  if (raftHalf.x > 0.0) {
    // the raft's two planks as they are now: its own foam, thinner and sparser than the banks'
    vec2 q = at - raftAt.xy;
    vec2 lp = vec2(q.x * raftAt.z - q.y * raftAt.w, q.x * raftAt.w + q.y * raftAt.z);
    float dRaft = max(min(boxDistance(lp, raftHalf), boxDistance(lp, raftHalf.yx)), 0.0);
    foamAmount = max(foamAmount, ribbons(uv, dRaft, wobble, stepNo, ease, ${FLOAT(raft.width)}, ${FLOAT(raft.presenceShift)}));
    dBank = min(dBank, dRaft);
  }
  float glow = 1.0 - smoothstep(0.0, ${FLOAT(c.glow)}, dBank);
  vec3 col = mix(base, light, glow * 0.85);
${shafts === undefined ? '' : shaftsGlsl(shafts)}${grade === undefined ? '' : gradeGlsl(grade)}  gl_FragColor = vec4(mix(col, foam, foamAmount), 1.0);
}`;
}
