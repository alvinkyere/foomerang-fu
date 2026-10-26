import * as THREE from 'three';

/**
 * A map's own look, when it is not the plaza's toon light (the manifest's `look`): the gong islands (owner, 2026-10-22: "make
 * the ground ours ... rendered into 3D exactly like it is in our HQs"). The HQ video lights the islands softly: a block's top
 * and its sunward sides almost the same lavender, its far side ~15% darker (9:41.6: top #a7b3e0, front #a4b0dd, right side
 * #8c9fba), the light from the upper left (the shadows fall to the lower right). And everything below the island tops fades
 * into the mist as it goes down (the cliffs: lavender under the lip, mist ~14 units down).
 *
 * With the ambient at `AMBIENT` and the sun at `SUN` (three.js's physical units: π lights a surface to its own colour; the light
 * works on linear colour, so these are linear), a top shows its colour as it is on screen, a side facing the viewer ~87% of
 * it, one facing south-west ~95%, west ~92%, south-east ~77%, east ~75%: fitted to reference.png (9:04.0), the centre
 * island's lip over its face (#b5c3df, #a0aecb) and the tilted island's south-west and south-east faces (#adb5ca, #828dc3),
 * so that the rock has the HQ's spread of tones (about a fifth of it the darker faces, #8d9bc1-#828db7).
 */
export interface SoftLook {
  /**
   * The mist behind everything, by height on the screen (`at`: 0 its bottom, 1 its top), 2 to 4 stops: the HQ's is greener
   * low on the screen and paler high up (reference.png: #e0f2d4 at the bottom, #e9f4e0 two thirds of the way down, #eff7eb
   * from 40% down).
   */
  readonly sky: readonly { readonly at: number; readonly colour: string }[];
  /**
   * Below the tops the rock fades: from `from` units down it turns toward the sky behind it tinted by `tint` (multiplied: the
   * HQ's is a warm light grey high on the screen, a light green low down, as the sky there is), and by `to` units down it is
   * the sky itself. `lip` (optional): a lit band under the tops, `lift` lighter at the top and none by `depth` units down
   * (the HQ's faces: lighter just under the lip, darker below it, before the mist takes them).
   */
  readonly mist: {
    readonly tint: string;
    readonly from: number;
    readonly to: number;
    readonly lip?: { readonly depth: number; readonly lift: number };
  };
  /**
   * The light (optional; absent: the fitted defaults below): the ambient and the sun in units of π (1 lights a surface facing
   * it to its own colour), and the direction toward the sun (scene axes: x east, y up, z toward the viewer).
   */
  /** Colours for the model's materials by name (the rock, the blocks: fitted to the HQ without rebuilding the model). */
  readonly colours?: Readonly<Record<string, string>>;
  readonly light?: {
    readonly ambient: number;
    readonly sun: number;
    readonly toward: readonly [number, number, number];
  };
}

const AMBIENT = 0.52 * Math.PI;
/**
 * How far toward the camera a character is drawn on 3D ground (scene units, the islands' layout units: a body is ~1.3 wide):
 * a little more than a body's width, so the ground round its feet never hides it, while a block or a tree in front of it
 * still does (ThreePlaza's Character.standPull).
 */
export const STAND_PULL = 1.5;
const SUN = 0.608 * Math.PI;
/** Toward the sun (scene axes: x east, y up, z toward the viewer): high, from the west and a little from the viewer. */
const TOWARD_SUN = new THREE.Vector3(-0.493, 0.789, 0.362).normalize();

/** The manifest's `look`, checked (the manifest is a file we ship, but a bad one must fail loudly, not draw nonsense). */
export function parseSoftLook(raw: unknown): SoftLook | undefined {
  if (raw === undefined) return undefined;
  const mist = (raw as { mist?: unknown } | null)?.mist as
    { tint?: unknown; from?: unknown; to?: unknown; lip?: unknown } | undefined;
  const sky = (raw as { sky?: unknown } | null)?.sky;
  const hex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const stops =
    Array.isArray(sky) && sky.length >= 2 && sky.length <= 4
      ? sky.map((stop: unknown) => stop as { at?: unknown; colour?: unknown })
      : [];
  if (
    stops.length === 0 ||
    stops.some(
      (stop, i) =>
        typeof stop?.at !== 'number' ||
        !(stop.at >= 0 && stop.at <= 1) ||
        !hex(stop.colour) ||
        (i > 0 && !((stop.at as number) > ((stops[i - 1] as { at: number }).at as number))),
    ) ||
    !hex(mist?.tint) ||
    typeof mist.from !== 'number' ||
    typeof mist.to !== 'number' ||
    !Number.isFinite(mist.from) ||
    !Number.isFinite(mist.to) ||
    !(mist.to > mist.from)
  )
    throw new Error('plaza manifest: bad look');
  const lip = mist.lip as { depth?: unknown; lift?: unknown } | undefined;
  if (
    lip !== undefined &&
    (typeof lip.depth !== 'number' ||
      typeof lip.lift !== 'number' ||
      !(lip.depth > 0 && lip.depth < 50) ||
      !(lip.lift >= 0 && lip.lift <= 1))
  )
    throw new Error('plaza manifest: bad look');
  const light = (raw as { light?: unknown }).light as
    { ambient?: unknown; sun?: unknown; toward?: unknown } | undefined;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (
    light !== undefined &&
    (!num(light.ambient) ||
      !num(light.sun) ||
      light.ambient < 0 ||
      light.sun < 0 ||
      !Array.isArray(light.toward) ||
      light.toward.length !== 3 ||
      !light.toward.every(num))
  )
    throw new Error('plaza manifest: bad look');
  const colours = (raw as { colours?: unknown }).colours;
  if (
    colours !== undefined &&
    (typeof colours !== 'object' ||
      colours === null ||
      Object.entries(colours).some(([k, v]) => !/^[a-z_]{1,40}$/.test(k) || !hex(v)))
  )
    throw new Error('plaza manifest: bad look');
  return {
    ...(colours === undefined ? {} : { colours: { ...(colours as Record<string, string>) } }),
    sky: stops.map((stop) => ({ at: stop.at as number, colour: stop.colour as string })),
    mist: {
      tint: mist.tint,
      from: mist.from,
      to: mist.to,
      ...(lip === undefined
        ? {}
        : { lip: { depth: lip.depth as number, lift: lip.lift as number } }),
    },
    ...(light === undefined
      ? {}
      : {
          light: {
            ambient: light.ambient as number,
            sun: light.sun as number,
            toward: light.toward as [number, number, number],
          },
        }),
  };
}

/** The sky's colour at height `t` on the screen (0 bottom, 1 top): between its stops, a straight blend. */
export function skyAt(look: SoftLook, t: number): THREE.Color {
  const stops = look.sky;
  const first = stops[0] as SoftLook['sky'][number];
  const last = stops[stops.length - 1] as SoftLook['sky'][number];
  if (t <= first.at) return new THREE.Color(first.colour);
  if (t >= last.at) return new THREE.Color(last.colour);
  const i = stops.findIndex((stop) => stop.at >= t);
  const a = stops[i - 1] as SoftLook['sky'][number];
  const b = stops[i] as SoftLook['sky'][number];
  return new THREE.Color(a.colour).lerp(new THREE.Color(b.colour), (t - a.at) / (b.at - a.at));
}

/** The sky as the scene's background: a picture of its stops, top to bottom, stretched over the screen. */
export function skyBackground(look: SoftLook): THREE.Texture {
  const rows = 256;
  const data = new Uint8Array(rows * 4);
  for (let r = 0; r < rows; r += 1) {
    const c = skyAt(look, r / (rows - 1)).convertLinearToSRGB();
    data.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], r * 4);
  }
  const texture = new THREE.DataTexture(data, 1, rows, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** The soft light: a strong even ambient and a weak sun. */
export function softLights(scene: THREE.Scene, look?: SoftLook): void {
  const l = look?.light;
  const sun = new THREE.DirectionalLight(0xffffff, l === undefined ? SUN : l.sun * Math.PI);
  sun.position
    .copy(l === undefined ? TOWARD_SUN : new THREE.Vector3(...l.toward).normalize())
    .multiplyScalar(100);
  sun.target.position.set(0, 0, 0);
  scene.add(
    sun,
    sun.target,
    new THREE.AmbientLight(0xffffff, l === undefined ? AMBIENT : l.ambient * Math.PI),
  );
}

/**
 * A model's material in the soft light: smooth (Lambert) shading of its colour or texture, mixed into the mist by how far
 * below the ground (scene height 0) it is: none above `from` units down, all of it from `to` units down.
 */
export function softMaterial(m: THREE.MeshStandardMaterial, look: SoftLook): THREE.Material {
  const named = look.colours?.[m.name];
  const soft = new THREE.MeshLambertMaterial({
    color: named === undefined ? m.color : new THREE.Color(named),
    map: m.map ?? null,
    side: m.side,
    vertexColors: m.vertexColors,
  });
  addMist(soft, look, true);
  return soft;
}

/**
 * An unlit material (the objects: flat-toned as the video draws them) kept unlit, but fading into the mist below the tops as
 * the rock does (the HQ: the maple rising from the cliff under the log bridge, its trunk pale in the mist).
 */
export function mistedUnlit(m: THREE.MeshBasicMaterial, look: SoftLook): THREE.MeshBasicMaterial {
  const misted = m.clone();
  addMist(misted, look, false);
  return misted;
}

/** The sky behind and the mist below the tops, into a material's shader (`lip`: the lit band under the tops too). */
function addMist(material: THREE.Material, look: SoftLook, lip: boolean): void {
  // the sky's stops for the shader (padded to four: a stop past the top repeats the last)
  const at = [0, 1, 2, 3].map((i) => (look.sky[i] ?? { at: 2 }).at);
  const colours = [0, 1, 2, 3].map(
    (i) => new THREE.Color((look.sky[i] ?? look.sky[look.sky.length - 1])?.colour),
  );
  material.onBeforeCompile = (shader) => {
    shader.uniforms['skyAt'] = { value: at };
    shader.uniforms['skyColour'] = { value: colours };
    shader.uniforms['mistTint'] = { value: new THREE.Color(look.mist.tint) };
    shader.uniforms['mistFrom'] = { value: look.mist.from };
    shader.uniforms['mistTo'] = { value: look.mist.to };
    shader.uniforms['lipDepth'] = { value: look.mist.lip?.depth ?? 1 };
    shader.uniforms['lipLift'] = { value: lip ? (look.mist.lip?.lift ?? 0) : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vMistY;\nvarying float vSkyT;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tvMistY = (modelMatrix * vec4(transformed, 1.0)).y;\n\tvSkyT = 0.5 + 0.5 * gl_Position.y / gl_Position.w;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        [
          'varying float vMistY;',
          'varying float vSkyT;',
          'uniform float skyAt[4];',
          'uniform vec3 skyColour[4];',
          'uniform vec3 mistTint;',
          'uniform float mistFrom;',
          'uniform float mistTo;',
          'uniform float lipDepth;',
          'uniform float lipLift;',
          'vec3 skyHere(float t) {',
          '  vec3 c = skyColour[0];',
          '  for (int i = 1; i < 4; i++) c = mix(c, skyColour[i], clamp((t - skyAt[i - 1]) / max(skyAt[i] - skyAt[i - 1], 1e-4), 0.0, 1.0));',
          '  return c;',
          '}',
          'void main() {',
        ].join('\n'),
      )
      .replace(
        '#include <tonemapping_fragment>',
        [
          // (the lit band under the tops: not on the tops themselves, at the ground's height)
          'gl_FragColor.rgb *= 1.0 + lipLift * step(0.05, -vMistY) * (1.0 - smoothstep(0.0, lipDepth, -vMistY));',
          'float mistAmount = smoothstep(mistFrom, mistTo, -vMistY);',
          'vec3 sky = skyHere(vSkyT);',
          'vec3 mistHere = mix(sky * mistTint, sky, smoothstep(mistFrom + (mistTo - mistFrom) * 0.45, mistTo, -vMistY));',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, mistHere, mistAmount);',
          '#include <tonemapping_fragment>',
        ].join('\n\t'),
      );
  };
}
