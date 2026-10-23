import * as THREE from 'three';

/**
 * A map's own look, when it is not the plaza's toon light (the manifest's `look`): the gong islands (owner, 2026-10-22: "make
 * the ground ours ... rendered into 3D exactly like it is in our HQs"). The HQ video lights the islands softly: a block's top
 * and its sunward sides almost the same lavender, its far side ~15% darker (9:41.6: top #a7b3e0, front #a4b0dd, right side
 * #8c9fba), the light from the upper left (the shadows fall to the lower right). And everything below the island tops fades
 * into the mist as it goes down (the cliffs: lavender under the lip, mist ~14 units down).
 *
 * With the ambient at `AMBIENT` and the sun at `SUN` (three.js's physical units: π lights a surface to its own colour; the light
 * works on linear colour, so these are linear), a top shows its colour as it is, a side facing the viewer ~88% of it on screen
 * (reference.png 9:04.0: the lip over the centre island's south face #b5c3df, the face #a0aecb), one facing west ~95%, one
 * facing east ~86%.
 */
export interface SoftLook {
  readonly mist: { readonly colour: string; readonly from: number; readonly to: number };
}

const AMBIENT = 0.723 * Math.PI;
/**
 * How far toward the camera a character is drawn on 3D ground (scene units, the islands' layout units: a body is ~1.3 wide):
 * a little more than a body's width, so the ground round its feet never hides it, while a block or a tree in front of it
 * still does (ThreePlaza's Character.standPull).
 */
export const STAND_PULL = 1.5;
const SUN = 0.326 * Math.PI;
/** Toward the sun (scene axes: x east, y up, z toward the viewer): high, from the west, barely from the viewer's side. */
const TOWARD_SUN = new THREE.Vector3(-0.6, 1, 0.15).normalize();

/** The manifest's `look`, checked (the manifest is a file we ship, but a bad one must fail loudly, not draw nonsense). */
export function parseSoftLook(raw: unknown): SoftLook | undefined {
  if (raw === undefined) return undefined;
  const mist = (raw as { mist?: unknown } | null)?.mist as
    { colour?: unknown; from?: unknown; to?: unknown } | undefined;
  if (
    typeof mist?.colour !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(mist.colour) ||
    typeof mist.from !== 'number' ||
    typeof mist.to !== 'number' ||
    !Number.isFinite(mist.from) ||
    !Number.isFinite(mist.to) ||
    !(mist.to > mist.from)
  )
    throw new Error('plaza manifest: bad look');
  return { mist: { colour: mist.colour, from: mist.from, to: mist.to } };
}

/** The soft light: a strong even ambient and a weak sun. */
export function softLights(scene: THREE.Scene): void {
  const sun = new THREE.DirectionalLight(0xffffff, SUN);
  sun.position.copy(TOWARD_SUN).multiplyScalar(100);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target, new THREE.AmbientLight(0xffffff, AMBIENT));
}

/**
 * A model's material in the soft light: smooth (Lambert) shading of its colour or texture, mixed into the mist by how far
 * below the ground (scene height 0) it is: none above `from` units down, all of it from `to` units down.
 */
export function softMaterial(m: THREE.MeshStandardMaterial, look: SoftLook): THREE.Material {
  const soft = new THREE.MeshLambertMaterial({
    color: m.color,
    map: m.map ?? null,
    side: m.side,
    vertexColors: m.vertexColors,
  });
  const mistColour = new THREE.Color(look.mist.colour);
  soft.onBeforeCompile = (shader) => {
    shader.uniforms['mistColour'] = { value: mistColour };
    shader.uniforms['mistFrom'] = { value: look.mist.from };
    shader.uniforms['mistTo'] = { value: look.mist.to };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vMistY;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tvMistY = (modelMatrix * vec4(transformed, 1.0)).y;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'varying float vMistY;\nuniform vec3 mistColour;\nuniform float mistFrom;\nuniform float mistTo;\nvoid main() {',
      )
      .replace(
        '#include <tonemapping_fragment>',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, mistColour, smoothstep(mistFrom, mistTo, -vMistY));\n\t#include <tonemapping_fragment>',
      );
  };
  return soft;
}
