/**
 * The boomerang's shape as the store's full-HD shots draw it (the yellow one lying at ss05; the pink and yellow ones held at
 * ss01): a fat "<", two thick arms meeting at a smoothly rounded elbow, opening at ≈ 90°, narrowing a little to rounded tips,
 * with a real thickness (held, it is seen edge-on). Half a character's height long: characters are drawn ≈ 70–76 u tall (the
 * bread and the ice cream against their 72 u rings), and the video's flying boomerang is 0.46 of the 27 px donut's width.
 *
 * Built by sweeping an elliptical section along its centre line (straight arms, a circular fillet at the elbow, half-round
 * tips): world units, lying flat in x/z (thickness along y), its elbow towards +z, its middle at x = 0. Pure numbers.
 */
export const BOOMERANG_SHAPE = Object.freeze({
  /** Tip to tip, world units. */
  span: 36,
  /** The angle its arms open at. */
  bendDegrees: 88,
  /** An arm's width at the elbow, as a fraction of the span; at the tips, this fraction of that. */
  armWidth: 0.4,
  tipWidth: 0.75,
  /** Its thickness, as a fraction of an arm's width (thin: seen edge-on it is a slim bar). */
  thickness: 0.34,
  /** The elbow's fillet radius, as a fraction of an arm's width. */
  elbow: 0.85,
});

export interface BoomerangMesh {
  /** x, y, z per vertex. */
  readonly positions: number[];
  readonly indices: number[];
}

type P2 = { x: number; z: number };

/** The boomerang's surface: `around` vertices per section, `alongArm` sections per straight arm. */
export function boomerangMesh(shape = BOOMERANG_SHAPE, around = 10, alongArm = 8): BoomerangMesh {
  const h = (shape.bendDegrees * Math.PI) / 360;
  const wE = (shape.armWidth * shape.span) / 2;
  const wT = wE * shape.tipWidth;
  const t = shape.thickness * wE;
  // the arms run from the apex (0, 0) out to the tips' centres, which sit `wT` short of the span (the round caps)
  const arm = (shape.span / 2 - wT) / Math.sin(h);
  const dir = (side: number): P2 => ({ x: side * Math.sin(h), z: -Math.cos(h) });
  // the fillet: a circle of radius rc tangent to both arms, its tangent points `d` from the apex
  const rc = shape.elbow * wE * 2;
  const d = rc / Math.tan(h);
  const centre: P2 = { x: 0, z: -rc / Math.sin(h) };
  // the centre line from the left tip to the right one, with its half-width at each point
  const line: { p: P2; w: number }[] = [];
  const width = (along: number) => wE + (wT - wE) * Math.min(1, along / arm);
  for (let i = 0; i <= alongArm; i += 1) {
    const s = arm - ((arm - d) * i) / alongArm; // from the tip in to the tangent point
    const u = dir(-1);
    line.push({ p: { x: u.x * s, z: u.z * s }, w: width(s) });
  }
  const arcSteps = 8;
  const a0 = Math.atan2(dir(-1).z * d - centre.z, dir(-1).x * d - centre.x);
  const a1 = Math.PI - a0;
  for (let i = 1; i < arcSteps; i += 1) {
    const a = a0 + ((a1 - a0) * i) / arcSteps;
    line.push({
      p: { x: centre.x + rc * Math.cos(a), z: centre.z + rc * Math.sin(a) },
      w: width(d),
    });
  }
  for (let i = alongArm; i >= 0; i -= 1) {
    const mirror = line[i] as { p: P2; w: number };
    line.push({ p: { x: -mirror.p.x, z: mirror.p.z }, w: mirror.w });
  }
  // sections: half-round caps beyond each tip, then the line
  const sections: { c: P2; n: P2; w: number; t: number }[] = [];
  const tangent = (k: number): P2 => {
    const a = line[Math.max(0, k - 1)] as { p: P2 };
    const b = line[Math.min(line.length - 1, k + 1)] as { p: P2 };
    const dx = b.p.x - a.p.x;
    const dz = b.p.z - a.p.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  };
  const cap = (k: number, outward: number) => {
    const tg = tangent(k);
    const at = line[k] as { p: P2; w: number };
    const steps = 4;
    const ring: typeof sections = [];
    for (let i = steps; i >= 1; i -= 1) {
      const phi = (Math.PI / 2) * (i / steps);
      ring.push({
        c: {
          x: at.p.x + outward * tg.x * at.w * Math.sin(phi),
          z: at.p.z + outward * tg.z * at.w * Math.sin(phi),
        },
        n: { x: -tg.z, z: tg.x },
        w: at.w * Math.cos(phi),
        t: t * Math.cos(phi),
      });
    }
    return ring;
  };
  sections.push(...cap(0, -1));
  line.forEach((q, k) => {
    const tg = tangent(k);
    sections.push({ c: q.p, n: { x: -tg.z, z: tg.x }, w: q.w, t });
  });
  sections.push(...cap(line.length - 1, 1).reverse());
  const positions: number[] = [];
  for (const s of sections)
    for (let j = 0; j < around; j += 1) {
      const th = (2 * Math.PI * j) / around;
      positions.push(
        s.c.x + s.n.x * s.w * Math.cos(th),
        s.t * Math.sin(th),
        s.c.z + s.n.z * s.w * Math.cos(th),
      );
    }
  const indices: number[] = [];
  for (let i = 0; i < sections.length - 1; i += 1)
    for (let j = 0; j < around; j += 1) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      const c = a + around;
      const e = b + around;
      indices.push(a, c, b, b, c, e);
    }
  // shift so its middle (between tips and elbow) is the origin
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i] as number);
    hi = Math.max(hi, positions[i] as number);
  }
  const mid = (lo + hi) / 2;
  for (let i = 2; i < positions.length; i += 3) positions[i] = (positions[i] as number) - mid;
  return { positions, indices };
}
