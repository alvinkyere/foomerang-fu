import * as THREE from 'three';

/**
 * The canal court's three waters, as the HQ draws them (foomerang-fu physics hq.mp4 10:55, art/canal_court): the tower's POOL, deep blue
 * with a pale foam boiling up in its middle where the water wells; the channel's RUN, a pale stream with darker cyan streaks flowing down
 * it and darker edges; the BASIN, pale, darker bands drifting round its octagon and the stream's water spreading in from the west. All
 * move smoothly (the HQ's change every frame). Each is a mesh of the map's model (FLOW_pool, FLOW_run, FLOW_basin); the plan places they
 * are drawn about come from the manifest (`canalWater`): the map's own data, checked, not trusted.
 *
 * Plan units (y north) from the mesh's own positions: the glb keeps Blender's (x, YC + y, z) as (x, z, -(YC + y)).
 */
export interface CanalWater {
  /** The plan's y offset in the model (build.py's YC). */
  readonly yc: number;
  readonly pool: { readonly cx: number; readonly cy: number; readonly r: number };
  readonly run: {
    readonly line: readonly (readonly [number, number])[];
    readonly halfWidth: number;
    /** How fast the streaks go down the run, plan units a second. */
    readonly speed: number;
  };
  readonly basin: {
    readonly cx: number;
    readonly cy: number;
    readonly r: number;
    readonly turn: number;
  };
}

export type CanalWaterKind = 'pool' | 'run' | 'basin';

/** The longest run line the shader holds. */
const MAX_LINE = 12;

const num = (v: unknown, lo = -1e4, hi = 1e4): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export function parseCanalWater(manifest: unknown): CanalWater | undefined {
  const w = (manifest as { canalWater?: unknown } | null)?.canalWater;
  if (w === null || typeof w !== 'object') return undefined;
  const r = w as Record<string, unknown>;
  const pool = r['pool'] as Record<string, unknown> | undefined;
  const run = r['run'] as Record<string, unknown> | undefined;
  const basin = r['basin'] as Record<string, unknown> | undefined;
  if (!num(r['yc']) || pool == null || run == null || basin == null) return undefined;
  if (!num(pool['cx']) || !num(pool['cy']) || !num(pool['r'], 0.01, 100)) return undefined;
  if (
    !num(basin['cx']) ||
    !num(basin['cy']) ||
    !num(basin['r'], 0.01, 100) ||
    !num(basin['turn'], -10, 10)
  )
    return undefined;
  const line = run['line'];
  if (!Array.isArray(line) || line.length < 2 || line.length > MAX_LINE) return undefined;
  if (!line.every((p) => Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1])))
    return undefined;
  if (!num(run['halfWidth'], 0.01, 10) || !num(run['speed'], 0, 20)) return undefined;
  return {
    yc: r['yc'],
    pool: { cx: pool['cx'], cy: pool['cy'], r: pool['r'] },
    run: {
      line: (line as [number, number][]).map(([x, y]) => [x, y] as const),
      halfWidth: run['halfWidth'],
      speed: run['speed'],
    },
    basin: { cx: basin['cx'], cy: basin['cy'], r: basin['r'], turn: basin['turn'] },
  };
}

// the HQ's colours (art/canal_court: sampled from the READY frame, converted to the video as the browser shows it: chrome.py)
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `vec3(${(((n >> 16) & 255) / 255).toFixed(4)}, ${(((n >> 8) & 255) / 255).toFixed(4)}, ${((n & 255) / 255).toFixed(4)})`;
};
const COL = {
  deep: '#4a79ca',
  deepEdge: '#6e89ca',
  rim: '#8798cf',
  rimTop: '#a4b2ea',
  poolFoam: '#aae0f0',
  runCore: '#98dcf1',
  runStreak: '#82c9ec',
  runEdge: '#80c7ec',
  runGlow: '#a1b3ea',
  basin: '#a6e0f0',
  basinBand: '#65c8ed',
  basinEdge: '#5fc3ec',
};

const VERTEX = /* glsl */ `
uniform float yc;
varying vec2 plan;
void main() {
  plan = vec2(position.x, -position.z - yc);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return v;
}
mat2 turn2(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }`;

function fragment(kind: CanalWaterKind, n: number): string {
  const body =
    kind === 'pool'
      ? /* glsl */ `
  // KIND_POOL: the well's foam boils up in the middle, swirling slowly; deep blue round it; at the hole's edge (poolR: its octagon's
  // corner radius) the HQ's soft ring: the blue lightens over ~0.6 units (#4469c0, #657ac0, #7e89c6) and runs into the rim's lavender
  vec2 p = plan - poolAt;
  float o = 0.0;
  for (int k = 0; k < 4; k++) { float a = float(k) * 0.785398; o = max(o, abs(dot(p, vec2(cos(a), sin(a))))); }
  float e = o - poolR * 0.9239;                   // (from the hole's edge, plan units: < 0 inside)
  float r = length(p) / poolR;
  float rf = length(p - vec2(0.0, -0.25 * poolR)) / poolR;
  // (the HQ's foam is another shape within half a second to a second: stabilised 657-664 s)
  vec2 q = turn2(time * 0.7 + r * 1.2) * p;
  vec2 bw = vec2(fbm(p * 0.7 + vec2(time * 1.1, 0.0)), fbm(p * 0.7 + vec2(3.0, -time * 1.1))) - 0.5;
  float n = fbm(q * 0.85 + bw * 1.2 + vec2(0.0, -time * 0.85));
  float foam = smoothstep(0.0, 0.04, n + (1.0 - rf) * 0.9 - 0.8) * (1.0 - smoothstep(-0.5, -0.2, e));
  vec3 c = mix(${rgb(COL.deep)}, ${rgb(COL.deepEdge)}, smoothstep(-0.8, -0.35, e));
  c = mix(c, ${rgb(COL.rim)}, smoothstep(-0.35, 0.0, e));
  c = mix(c, ${rgb(COL.rimTop)}, smoothstep(0.0, 0.45, e));
  gl_FragColor = vec4(mix(c, ${rgb(COL.poolFoam)}, foam), 1.0);`
      : kind === 'run'
        ? /* glsl */ `
  // KIND_RUN: where along the run (s) and how far across it (d) this point is, from the nearest piece of its line
  float best = 1e9; float s = 0.0; float d = 0.0; float acc = 0.0;
  for (int k = 0; k < ${n - 1}; k++) {
    vec2 a = line[k]; vec2 b = line[k + 1]; vec2 ab = b - a; float L = length(ab);
    float t = clamp(dot(plan - a, ab) / (L * L), 0.0, 1.0);
    vec2 off = plan - (a + ab * t); float dd = length(off);
    if (dd < best) { best = dd; s = acc + t * L; d = (ab.x * off.y - ab.y * off.x) / L; }
    acc += L;
  }
  // (across, as the HQ's at 10:55: a bright core, a darker cyan line each side of it, then a glow fading out to the lavender)
  float x = abs(d) / runHalf;
  float streak = smoothstep(0.55, 0.75, fbm(vec2(s * 0.9 - time * runSpeed, d * 3.5)));
  vec3 c = mix(${rgb(COL.runCore)}, ${rgb(COL.runStreak)}, streak * 0.8);
  c = mix(c, ${rgb(COL.runEdge)}, smoothstep(0.25, 0.4, x));
  c = mix(c, ${rgb(COL.runGlow)}, smoothstep(0.45, 1.0, x));
  gl_FragColor = vec4(c, 1.0);`
        : /* glsl */ `
  // KIND_BASIN: the HQ's brushed water: pale strokes swirling round the octagon on its darker cyan, about half and half, the
  // strokes drawn along the swirl (noise stretched along it) and drifting round; darkest by the blocks
  vec2 p = turn2(-basinTurn) * (plan - basinAt);
  float o = 0.0;
  for (int k = 0; k < 4; k++) { float a = float(k) * 0.785398; o = max(o, abs(dot(p, vec2(cos(a), sin(a))))); }
  o /= basinR;
  // (the HQ's, stabilised 657-664 s: no turning; a drift east of ~0.1 units a second, and the strokes re-form where they are, the
  // pattern gone to another in about a second: the strokes' field warped by a second noise that moves)
  vec2 w = vec2(fbm(p * 0.5 + vec2(time * 0.9, 0.0)), fbm(p * 0.5 + vec2(7.0, time * 0.9))) - 0.5;
  vec2 q = turn2(o * 1.6) * (p - vec2(time * 0.1, 0.0) + w * 1.4);
  float n = fbm(vec2(q.x * 0.45, q.y * 1.6));
  float pale = smoothstep(0.47, 0.53, n + (0.55 - o) * 0.35);
  vec3 c = mix(${rgb(COL.basinBand)}, ${rgb(COL.basin)}, pale);
  c = mix(c, ${rgb(COL.basinEdge)}, smoothstep(0.86, 1.0, o) * 0.8);
  gl_FragColor = vec4(c, 1.0);`;
  return /* glsl */ `
uniform float time;
uniform vec2 poolAt; uniform float poolR;
uniform vec2 line[${MAX_LINE}]; uniform float runHalf; uniform float runSpeed;
uniform vec2 basinAt; uniform float basinR; uniform float basinTurn;
varying vec2 plan;
${NOISE}
void main() {${body}
}`;
}

/** The shader for one of the waters; its `time` uniform (seconds) is the caller's to advance. */
export function canalWaterMaterial(kind: CanalWaterKind, w: CanalWater): THREE.ShaderMaterial {
  const line = Array.from({ length: MAX_LINE }, (_, i) => {
    const p = w.run.line[Math.min(i, w.run.line.length - 1)] ?? [0, 0];
    return new THREE.Vector2(p[0], p[1]);
  });
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, // (the spout's faces down the tower's rim are built either way round)
    vertexShader: VERTEX,
    fragmentShader: fragment(kind, w.run.line.length),
    uniforms: {
      time: { value: 0 },
      yc: { value: w.yc },
      poolAt: { value: new THREE.Vector2(w.pool.cx, w.pool.cy) },
      poolR: { value: w.pool.r },
      line: { value: line },
      runHalf: { value: w.run.halfWidth },
      runSpeed: { value: w.run.speed },
      basinAt: { value: new THREE.Vector2(w.basin.cx, w.basin.cy) },
      basinR: { value: w.basin.r },
      basinTurn: { value: w.basin.turn },
    },
  });
}
