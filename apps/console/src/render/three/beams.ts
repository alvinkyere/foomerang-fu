import * as THREE from 'three';

/**
 * A map's light beams (the bridge islands, the HQ 1:12, top right): crisp slanting bands of light ADDED over everything on the screen
 * there, walls and islets as well as the water (waterShader's `shafts` only brighten the water). Measured from the HQ frame by
 * art/bridge_islands/fit_beams.py. `angle` (degrees) turns the bands' normal; `stops` are [t, strength] pairs, t in frame pixels (1920 x
 * 1080) along that normal from the frame's centre, strength in levels of the light's green (linear between stops, none outside);
 * `fade` the screen heights (0 top, 1 bottom) where the beams are full and gone; `add` the light's RGB per unit of strength.
 */
export interface LightBeams {
  readonly angle: number;
  readonly stops: readonly (readonly [number, number])[];
  readonly fade: readonly [number, number];
  readonly add: readonly [number, number, number];
  /**
   * The beams fall beyond the long wall: only pixels ABOVE this line (frame pixels, x increasing; flat beyond its ends) get them. The HQ's
   * grass in front of the wall is not lit (its colour is the grass's own), the wall and the water beyond are.
   */
  readonly above?: readonly (readonly [number, number])[];
}

/** The line's height (frame pixels) at x: linear between its points, flat beyond its ends. */
function lineAt(line: readonly (readonly [number, number])[], x: number): number {
  const first = line[0] as readonly [number, number];
  const last = line[line.length - 1] as readonly [number, number];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < line.length; i += 1) {
    const [x0, y0] = line[i - 1] as readonly [number, number];
    const [x1, y1] = line[i] as readonly [number, number];
    if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
  }
  return last[1];
}

const smooth = (e0: number, e1: number, x: number) => {
  const u = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return u * u * (3 - 2 * u);
};

/** The beams' strength (levels of green) at a pixel of the 1920 x 1080 frame: the profile across the bands, times the fade down the screen. */
export function beamStrength(b: LightBeams, x: number, y: number): number {
  const a = (b.angle * Math.PI) / 180;
  const t = (x - 960) * Math.sin(a) + (y - 540) * -Math.cos(a);
  const s = b.stops;
  if (s.length === 0) return 0;
  if (b.above !== undefined && b.above.length > 0 && y > lineAt(b.above, x)) return 0;
  const first = s[0] as readonly [number, number];
  const last = s[s.length - 1] as readonly [number, number];
  if (t < first[0] || t > last[0]) return 0;
  let v = 0;
  for (let i = 1; i < s.length; i += 1) {
    const [t0, v0] = s[i - 1] as readonly [number, number];
    const [t1, v1] = s[i] as readonly [number, number];
    if (t <= t1) {
      v = v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
      break;
    }
  }
  return v * (1 - smooth(b.fade[0], b.fade[1], y / 1080));
}

const F = (x: number) => x.toFixed(4);

/** The beams' fragment shader: the profile as a texture lookup would blur the crisp edges, so it is written out as nested mixes. */
export function beamsFragment(b: LightBeams): string {
  const a = (b.angle * Math.PI) / 180;
  const s = b.stops;
  let prof = '0.0';
  for (let i = s.length - 1; i > 0; i -= 1) {
    const [t0, v0] = s[i - 1] as readonly [number, number];
    const [t1, v1] = s[i] as readonly [number, number];
    prof = `(t <= ${F(t1)} ? mix(${F(v0)}, ${F(v1)}, (t - ${F(t0)}) / ${F(t1 - t0)}) : ${prof})`;
  }
  const first = s.length > 0 ? (s[0] as readonly [number, number])[0] : 0;
  const line = b.above ?? [];
  let lineY = line.length > 0 ? F((line[line.length - 1] as readonly [number, number])[1]) : '1e9';
  for (let i = line.length - 1; i > 0; i -= 1) {
    const [x0, y0] = line[i - 1] as readonly [number, number];
    const [x1, y1] = line[i] as readonly [number, number];
    lineY = `(px.x <= ${F(x1)} ? mix(${F(y0)}, ${F(y1)}, clamp((px.x - ${F(x0)}) / ${F(x1 - x0)}, 0.0, 1.0)) : ${lineY})`;
  }
  return `uniform vec2 resolution;
void main() {
  vec2 px = vec2(gl_FragCoord.x / resolution.x * 1920.0, (1.0 - gl_FragCoord.y / resolution.y) * 1080.0);
  float t = (px.x - 960.0) * ${F(Math.sin(a))} + (px.y - 540.0) * ${F(-Math.cos(a))};
  float strength = t < ${F(first)} ? 0.0 : ${prof};
  if (px.y > ${lineY}) strength = 0.0;
  strength *= 1.0 - smoothstep(${F(b.fade[0])}, ${F(b.fade[1])}, px.y / 1080.0);
  gl_FragColor = vec4(vec3(${b.add.map(F).join(', ')}) * max(strength, 0.0) / 255.0, 1.0);
}
`;
}

/** The beams as a scene of their own (one quad over the whole canvas, added on top), drawn after the map: `render` it with the renderer. */
export function beamsOverlay(b: LightBeams): {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  resolution: THREE.Vector2;
} {
  const resolution = new THREE.Vector2(1920, 1080);
  const material = new THREE.ShaderMaterial({
    uniforms: { resolution: { value: resolution } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: beamsFragment(b),
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), resolution };
}
