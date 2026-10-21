/**
 * The fountain's water as the reference video shows it (art/physics_reference/README.md, "The water"). Not a flat disc: a pale
 * glow hugs every edge, the basin's wall and the shell island alike, and thin light foam lines are born at each edge and drift
 * slowly away from it, fading, broken into pieces. Lines that follow an edge are lines of equal distance from it, so the look is
 * a function of that distance (baked from the plaza's meshes: art/physics_reference/water_field.py), a noise that breaks the
 * lines, and time. `waterAt` is the model; `WATER_GLSL` is the same for the GPU (render/three/waterShader.ts).
 *
 * Measured: the colours are environ2's (its water, and the light of its 3% lightest); the drift traced along three radii of the
 * registered footage (2:10–2:20): ≈ 1–1.2 map px a second, 0.06 units; the line ≈ 0.5 units off the wall in the store's HD
 * shot of this plaza, ≈ 0.08 thick, about one at a time off each edge; the glow ≈ 0.3 units wide.
 */
export const WATER_LOOK = Object.freeze({
  base: '#78d2e7',
  light: '#a9e6ec',
  foam: '#effcff',
  /** How far from an edge its glow reaches, units. */
  glowWidth: 0.3,
  /** Between one foam line and the next, units. */
  foamSpacing: 0.6,
  /** Half a line's thickness, units. */
  foamWidth: 0.04,
  /** How fast lines drift away from their edge, units a second. */
  drift: 0.06,
  /** How far out a line has faded to nothing, units. */
  foamReach: 0.75,
});

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** The water `d` units from its nearest edge at `t` seconds: its glow and its foam, 0…1 (`piece`: the noise there, 0…1). */
export function waterAt(d: number, piece: number, t: number): { glow: number; foam: number } {
  const { glowWidth, foamSpacing, foamWidth, drift, foamReach } = WATER_LOOK;
  const phase = d / foamSpacing - (t * drift) / foamSpacing;
  const f = phase - Math.floor(phase);
  const line = 1 - smoothstep(0, foamWidth, Math.min(f, 1 - f) * foamSpacing);
  const fade = smoothstep(0.03, 0.12, d) * (1 - smoothstep(0.15, foamReach, d));
  return {
    glow: 1 - smoothstep(0, glowWidth, d),
    foam: line * fade * smoothstep(0.45, 0.6, piece),
  };
}

const f = (v: number) => v.toFixed(4);

/** `waterAt` in GLSL: `vec2 waterAt(float d, float piece, float t)` → (glow, foam). */
export const WATER_GLSL = `
vec2 waterAt(float d, float piece, float t) {
  float phase = d / ${f(WATER_LOOK.foamSpacing)} - t * ${f(WATER_LOOK.drift / WATER_LOOK.foamSpacing)};
  float k = fract(phase);
  float line = 1.0 - smoothstep(0.0, ${f(WATER_LOOK.foamWidth)}, min(k, 1.0 - k) * ${f(WATER_LOOK.foamSpacing)});
  float fade = smoothstep(0.03, 0.12, d) * (1.0 - smoothstep(0.15, ${f(WATER_LOOK.foamReach)}, d));
  return vec2(1.0 - smoothstep(0.0, ${f(WATER_LOOK.glowWidth)}, d), line * fade * smoothstep(0.45, 0.6, piece));
}`;
