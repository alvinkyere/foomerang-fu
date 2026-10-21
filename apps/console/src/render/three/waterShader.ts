import * as THREE from 'three';
import { WATER_GLSL, WATER_LOOK } from '../waterLook';

/**
 * The fountain's water (render/waterLook.ts): environ2's blue, a pale glow along every edge, foam lines drifting away from the
 * wall and the island. `field` is art/physics_reference/water_field.py's bake (R: distance to the nearest edge, 0…`far`
 * units; G: the noise that breaks the lines) over the square `box` (centre x, z and half its side, scene units).
 * Flat, as the video's water is: its colours are written as they are.
 */
export function waterMaterial(
  field: THREE.Texture,
  box: { x: number; z: number; half: number },
  far: number,
): THREE.ShaderMaterial {
  // written as they are (sRGB, as the canvas shows them): read straight from the hex
  const rgb = (c: string) =>
    new THREE.Vector3(...[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255));
  return new THREE.ShaderMaterial({
    uniforms: {
      field: { value: field },
      box: { value: new THREE.Vector3(box.x - box.half, box.z - box.half, 2 * box.half) },
      time: { value: 0 },
      base: { value: rgb(WATER_LOOK.base) },
      light: { value: rgb(WATER_LOOK.light) },
      foam: { value: rgb(WATER_LOOK.foam) },
    },
    vertexShader: `varying vec2 at;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  at = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: `uniform sampler2D field; uniform vec3 box; uniform float time; uniform vec3 base, light, foam;
varying vec2 at;
${WATER_GLSL}
void main() {
  vec2 uv = (at - box.xy) / box.z;
  float d = texture2D(field, uv).r * ${far.toFixed(3)};
  float piece = texture2D(field, uv * 1.5 + vec2(time * 0.004, time * -0.003)).g;
  vec2 w = waterAt(d, piece, time);
  vec3 c = mix(base, light, w.x * 0.85);
  gl_FragColor = vec4(mix(c, foam, w.y * 0.9), 1.0);
}`,
  });
}
