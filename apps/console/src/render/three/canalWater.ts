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
  /**
   * The HQ's water traced as our own drawing (art/canal_court/water_art.py): for each body its texture's plan box [x0, y0, x1, y1]
   * (the texture is water_<body>.png beside the manifest) and its palette (dark to light): the shader moves the drawing and snaps every
   * pixel to the palette, so the cartoon's hard edges stay hard. Absent: the procedural water.
   */
  readonly art?: Readonly<
    Record<CanalWaterKind, { readonly box: readonly number[]; readonly palette: readonly string[] }>
  >;
}

export type CanalWaterKind = 'pool' | 'run' | 'basin';

/** The longest run line the shader holds. */
const MAX_LINE = 12;
/** Each traced water's tones. */
const PALETTE = 4;

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
  const art = r['art'];
  if (art !== undefined) {
    if (art === null || typeof art !== 'object') return undefined;
    for (const kind of ['pool', 'run', 'basin'] as const) {
      const a = (art as Record<string, unknown>)[kind] as Record<string, unknown> | undefined;
      const box = a?.['box'];
      const palette = a?.['palette'];
      if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => num(v))) return undefined;
      if (!Array.isArray(palette) || palette.length < 2 || palette.length > PALETTE)
        return undefined;
      if (!palette.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)))
        return undefined;
    }
  }
  // (every field the shaders read is checked above; anything else in it is never read)
  return w as CanalWater;
}

// the HQ's colours (art/canal_court: sampled from the READY frame, converted to the video as the browser shows it: chrome.py)
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `vec3(${(((n >> 16) & 255) / 255).toFixed(4)}, ${(((n >> 8) & 255) / 255).toFixed(4)}, ${((n & 255) / 255).toFixed(4)})`;
};
const COL = {
  deep: '#4a7bc4',
  deepEdge: '#5a73c2',
  rim: '#8798cf',
  rimTop: '#a4b2ea',
  poolFoam: '#abe0f0',
  runCore: '#aae1f0',
  runStreak: '#6cc6ea',
  runEdge: '#6cc6ea',
  runGlow: '#b4dcfb',
  basin: '#aae3f4',
  basinBand: '#65c4e8',
  basinEdge: '#5fc3ec',
  basinShadow: '#4a5f88',
};

const VERTEX = /* glsl */ `
uniform float yc;
varying vec2 plan;
void main(){
plan=vec2(position.x,-position.z-yc);
gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

const NOISE = /* glsl */ `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){
vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);
}
float fbm(vec2 p){
float v=0.0;float a=0.5;
for(int k=0;k<4;k++){v+=a*vnoise(p);p=p*2.03+vec2(17.0,9.0);a*=0.5;}
return v;
}
mat2 turn2(float a){float c=cos(a);float s=sin(a);return mat2(c,-s,s,c);}`;

/*
 * The shaders (their comments here, not in the strings: the strings ship). POOL: the octagon distance `e` from the hole's edge (poolR: its
 * corner radius); the HQ's soft ring there, the blue lightening over ~0.6 units (#4469c0, #657ac0, #7e89c6) into the rim's lavender; the
 * foam a blob a little south of the middle, towards the spout, re-formed within half a second to a second (stabilised frames 657-664 s).
 * RUN (the READY frame itself, not the round's mosaic, whose median thinned it to a line): a wide pale stream, hard-edged mid-cyan
 * streaks along it and bits of them along its edges, a light rim at each side. BASIN: hard chevron bands, '>' spreading east from the
 * inlet on the west, ~1.4 units apart, drifting east ~0.07 units a second, their edges bent by a moving noise; darkest by the blocks, a thin dark line under the far (north) ones.
 */
function fragment(kind: CanalWaterKind, n: number): string {
  const body =
    kind === 'pool'
      ? /* glsl */ `
// KIND_POOL
vec2 p=plan-poolAt;
float o=0.0;
for(int k=0;k<4;k++){float a=float(k)*0.785398;o=max(o,abs(dot(p,vec2(cos(a),sin(a)))));}
float e=o-poolR*0.9239;
float r=length(p)/poolR;
vec2 bw=vec2(fbm(p*0.7+vec2(time*0.9,0.0)),fbm(p*0.7+vec2(3.0,-time*0.9)))-0.5;
vec2 pv=p+bw*0.9;
float ang=atan(pv.y,pv.x);
float arms=0.5+0.5*sin(ang+5.0*length(pv)/poolR-time*1.6)+(fbm(p*0.9+vec2(0.0,-time*0.6))-0.5)*0.8+0.35*smoothstep(0.0,0.6,-pv.y/poolR);
float nw=0.1+0.22*smoothstep(0.35,0.95,-p.y/poolR);float neck=(1.0-smoothstep(nw,nw+0.06,abs(p.x+0.08*sin(p.y*3.0+time*2.0))/poolR))*smoothstep(0.2,0.55,-p.y/poolR);
float foam=max(smoothstep(0.58,0.61,arms)*smoothstep(0.08,0.16,r),neck)*(1.0-smoothstep(-0.75,-0.45,e));
vec3 c=mix(${rgb(COL.deep)},${rgb(COL.deepEdge)},smoothstep(-0.3,0.0,e));
c=mix(c,${rgb(COL.rim)},smoothstep(0.0,0.22,e));
c=mix(c,${rgb(COL.rimTop)},smoothstep(0.2,0.45,e));
gl_FragColor=vec4(mix(c,${rgb(COL.poolFoam)},foam),1.0);`
      : kind === 'run'
        ? /* glsl */ `
// KIND_RUN
float best=1e9;float s=0.0;float d=0.0;float acc=0.0;
for(int k=0;k<${n - 1};k++){
vec2 a=line[k];vec2 b=line[k+1];vec2 ab=b-a;float L=length(ab);
float t=clamp(dot(plan-a,ab)/(L*L),0.0,1.0);
vec2 off=plan-(a+ab*t);float dd=length(off);
if(dd<best){best=dd;s=acc+t*L;d=(ab.x*off.y-ab.y*off.x)/L;}
acc+=L;
}
float x=abs(d)/runHalf;
float streak=smoothstep(0.57,0.6,fbm(vec2(s*0.7-time*runSpeed,d*2.5)));
vec3 c=mix(${rgb(COL.runCore)},${rgb(COL.runStreak)},streak);
c=mix(c,${rgb(COL.runEdge)},smoothstep(0.66,0.7,x)*smoothstep(0.5,0.53,fbm(vec2(s*1.3-time*runSpeed,d*5.0+3.0))));
c=mix(c,${rgb(COL.runGlow)},smoothstep(0.86,0.96,x));
gl_FragColor=vec4(c,1.0);`
        : /* glsl */ `
// KIND_BASIN
vec2 p=turn2(-basinTurn)*(plan-basinAt);
float o=0.0;
for(int k=0;k<4;k++){float a=float(k)*0.785398;o=max(o,abs(dot(p,vec2(cos(a),sin(a)))));}
o/=basinR;
vec2 q=p+vec2(basinR,0.0);
vec2 w=vec2(fbm(p*0.6+vec2(time*0.6,0.0)),fbm(p*0.6+vec2(7.0,time*0.6)))-0.5;
float band=fract((q.x+abs(q.y)*1.0)/2.1-time*0.05+(w.x+w.y)*0.8);
float dark=smoothstep(0.0,0.03,band)*(1.0-smoothstep(0.46,0.49,band));
vec3 c=mix(${rgb(COL.basin)},${rgb(COL.basinBand)},dark);
c=mix(c,${rgb(COL.basinEdge)},smoothstep(0.86,1.0,o)*0.8);
c=mix(c,${rgb(COL.basinShadow)},smoothstep(0.95,0.98,o)*smoothstep(-0.2,0.3,p.y/basinR));
gl_FragColor=vec4(c,1.0);`;
  return /* glsl */ `
uniform float time;
uniform vec2 poolAt;uniform float poolR;
uniform vec2 line[${MAX_LINE}];uniform float runHalf;uniform float runSpeed;
uniform vec2 basinAt;uniform float basinR;uniform float basinTurn;
varying vec2 plan;
${NOISE}
void main(){${body}
}`;
}

/*
 * The traced water (art): the drawing moved two ways at once, half a period apart, cross-faded (a flow map's two phases), then each pixel
 * snapped to the body's palette: the shapes slide and morph and their edges stay hard, as the HQ's cartoon water. RUN: along the stream
 * (its nearest leg's direction) at runSpeed. POOL: turning about its middle, less near the spout so its neck stays; past the hole's
 * edge the soft ring into the rim's lavender. BASIN: drifting east (the HQ's ~0.1 units a second), bent a little by a moving noise.
 */
function fragmentArt(kind: CanalWaterKind, n: number): string {
  const flow =
    kind === 'run'
      ? /* glsl */ `
// KIND_RUN
float best=1e9;vec2 dir=vec2(1.0,0.0);
for(int k=0;k<${n - 1};k++){
vec2 a=line[k];vec2 b=line[k+1];vec2 ab=b-a;float L=length(ab);
float t=clamp(dot(plan-a,ab)/(L*L),0.0,1.0);
float dd=length(plan-(a+ab*t));
if(dd<best){best=dd;dir=ab/L;}
}
vec2 qa=plan-dir*runSpeed*pa*T;vec2 qb=plan-dir*runSpeed*pb*T;
vec3 c=snap(mix(art(qb),art(qa),wa));`
      : kind === 'pool'
        ? /* glsl */ `
// KIND_POOL
vec2 p=plan-poolAt;
float o=0.0;
for(int k=0;k<4;k++){float a=float(k)*0.785398;o=max(o,abs(dot(p,vec2(cos(a),sin(a)))));}
float e=o-poolR*0.9239;
float keep=1.0-0.85*smoothstep(0.15,0.7,-p.y/poolR)*(1.0-smoothstep(0.12,0.45,abs(p.x)/poolR));
vec2 qa=poolAt+turn2(0.35*pa*T*keep)*p;vec2 qb=poolAt+turn2(0.35*pb*T*keep)*p;
vec3 c=snap(mix(art(qb),art(qa),wa));
c=mix(c,${rgb(COL.rim)},smoothstep(0.0,0.22,e));
c=mix(c,${rgb(COL.rimTop)},smoothstep(0.2,0.45,e));`
        : /* glsl */ `
// KIND_BASIN
vec2 w=vec2(fbm(plan*0.5+vec2(time*0.3,0.0)),fbm(plan*0.5+vec2(5.0,time*0.3)))-0.5;
vec2 qa=plan-vec2(0.12,0.0)*pa*T+w*0.5*wa;vec2 qb=plan-vec2(0.12,0.0)*pb*T+w*0.5*(1.0-wa);
vec3 c=snap(mix(art(qb),art(qa),wa));`;
  return /* glsl */ `
uniform float time;
uniform vec2 poolAt;uniform float poolR;
uniform vec2 line[${MAX_LINE}];uniform float runHalf;uniform float runSpeed;
uniform sampler2D artTex;uniform vec4 artBox;uniform vec3 palette[${PALETTE}];
varying vec2 plan;
${NOISE}
vec3 art(vec2 q){return texture2D(artTex,vec2((q.x-artBox.x)/(artBox.z-artBox.x),(q.y-artBox.y)/(artBox.w-artBox.y))).rgb;}
vec3 snap(vec3 c){vec3 b=palette[0];float d=1e9;for(int i=0;i<${PALETTE};i++){vec3 g=c-palette[i];float e=dot(g,g);if(e<d){d=e;b=palette[i];}}return b;}
void main(){
float T=2.0;float pa=fract(time/T);float pb=fract(time/T+0.5);float wa=1.0-abs(2.0*pa-1.0);${flow}
gl_FragColor=vec4(c,1.0);
}`;
}

const vec3Of = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** The shader for one of the waters; its `time` uniform (seconds) is the caller's to advance. With `art` (the body's traced drawing,
 * water_<body>.png) and the manifest's art for it, the traced water; otherwise the procedural one. */
export function canalWaterMaterial(
  kind: CanalWaterKind,
  w: CanalWater,
  art?: THREE.Texture,
): THREE.ShaderMaterial {
  const traced = art !== undefined ? w.art?.[kind] : undefined;
  const line = Array.from({ length: MAX_LINE }, (_, i) => {
    const p = w.run.line[Math.min(i, w.run.line.length - 1)] ?? [0, 0];
    return new THREE.Vector2(p[0], p[1]);
  });
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, // (the spout's faces down the tower's rim are built either way round)
    vertexShader: VERTEX,
    fragmentShader:
      traced !== undefined
        ? fragmentArt(kind, w.run.line.length)
        : fragment(kind, w.run.line.length),
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
      ...(traced !== undefined && art !== undefined
        ? {
            artTex: { value: art },
            artBox: {
              value: new THREE.Vector4(...(traced.box as [number, number, number, number])),
            },
            palette: {
              value: Array.from({ length: PALETTE }, (_, i) =>
                vec3Of(traced.palette[Math.min(i, traced.palette.length - 1)] ?? '#000000'),
              ),
            },
          }
        : {}),
    },
  });
}
