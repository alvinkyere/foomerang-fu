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
    style.cartoon === undefined ? fountainFragment(glsl, far) : cartoonFragment(style.cartoon, far);
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
    vertexShader: `varying vec2 at;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  at = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: fragment,
  });
}

const FLOAT = (x: number) => x.toFixed(4);

/** The fountain's water: glow along an edge, thin lines drifting off it, broken by the field's noise. */
function fountainFragment(glsl: string, far: number): string {
  return `uniform sampler2D field; uniform vec3 box; uniform float time; uniform vec3 base, light, foam; uniform vec4 raftAt; uniform vec2 raftHalf;
varying vec2 at;
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
function cartoonFragment(c: CartoonWater, far: number): string {
  const ribbons = c.ribbons
    .map((r, i) => {
      const k = i + 1;
      return `  {
    float n = texture2D(field, uv * ${FLOAT(1.5 + 0.7 * i)} + vec2(time * ${FLOAT(0.01 + 0.003 * i)}, time * ${FLOAT(-0.007 - 0.002 * i)}) + vec2(${FLOAT(0.31 * k)}, ${FLOAT(0.17 * k)})).g;
    float centre = ${FLOAT(r.centre)} + ${FLOAT(r.sway)} * sin(time * ${FLOAT((0.7 + 0.2 * i) * c.motion)} + n * 6.2832 + ${FLOAT(1.3 * i)});
    float reach = ${FLOAT(r.width)} * smoothstep(0.28, 0.55, n);
    foamAmount = max(foamAmount, 1.0 - smoothstep(reach * 0.6, reach, abs(dw - centre)));
  }`;
    })
    .join('\n');
  return `uniform sampler2D field; uniform vec3 box; uniform float time; uniform vec3 base, light, foam; uniform vec4 raftAt; uniform vec2 raftHalf;
varying vec2 at;
float boxDistance(vec2 p, vec2 size) {
  vec2 a = abs(p) - size;
  return length(max(a, 0.0)) + min(max(a.x, a.y), 0.0);
}
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec2 uv = (at - box.xy) / box.z;
  float d = texture2D(field, uv).r * ${far.toFixed(3)};
  if (raftHalf.x > 0.0) {
    vec2 q = at - raftAt.xy;
    vec2 lp = vec2(q.x * raftAt.z - q.y * raftAt.w, q.x * raftAt.w + q.y * raftAt.z);
    d = min(d, max(min(boxDistance(lp, raftHalf), boxDistance(lp, raftHalf.yx)), 0.0));
  }
  // the outline's wobble: two draws of the fine noise, each looked up somewhere new at its step of the boil, morphed from one to the next
  float stepNo = floor(time * ${FLOAT(c.fps)});
  float into = fract(time * ${FLOAT(c.fps)});
  float drawA = texture2D(field, uv * 1.3 + vec2(hash(stepNo), hash(stepNo + 11.0))).b;
  float drawB = texture2D(field, uv * 1.3 + vec2(hash(stepNo + 1.0), hash(stepNo + 12.0))).b;
  float wobble = mix(drawA, drawB, smoothstep(0.0, 1.0, into)) - 0.5;      // (large and slow: a gentle wave, not a scribble)
  float dw = d + wobble * ${FLOAT(c.wobble)};
  float foamAmount = 0.0;
${ribbons}
  float glow = 1.0 - smoothstep(0.0, ${FLOAT(c.glow)}, d);
  vec3 col = mix(base, light, glow * 0.85);
  gl_FragColor = vec4(mix(col, foam, foamAmount), 1.0);
}`;
}
