import * as THREE from 'three';

/**
 * Cuts a mesh in two across a plane, as a killed character comes apart in the HQs (the eggplant at HQ1 2:03.4: the top flies off
 * along the hit, the bottom stands showing a flat pale cut face). Every triangle is clipped against the plane; where the surface
 * crosses it the cut's outline is traced into closed loops and filled with a flat cap, so each half is solid from every side as it
 * tumbles. The surface keeps its material groups; the caps are one more group (the next material index), coloured as the inside.
 */
export interface CutHalves {
  /** The part on the plane's normal side. */
  readonly above: THREE.BufferGeometry;
  readonly below: THREE.BufferGeometry;
  /** The caps' material index in both halves. */
  readonly capMaterial: number;
}

interface Vertex {
  readonly p: THREE.Vector3;
  readonly n: THREE.Vector3;
  readonly uv: THREE.Vector2;
}

interface Builder {
  readonly position: number[];
  readonly normal: number[];
  readonly uv: number[];
  /** Per surface material, its triangles' vertices (flat, 3 per triangle). */
  readonly byMaterial: Map<number, Vertex[]>;
  /** The cut's segments on this half (pairs of points). */
  readonly segments: [THREE.Vector3, THREE.Vector3][];
}

const EPS = 1e-9;
const KEY = 1e5; // points closer than 1e-5 are one point when the loops are traced

export function cutGeometry(source: THREE.BufferGeometry, plane: THREE.Plane): CutHalves {
  const g = source.index === null ? source : source.toNonIndexed();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const tex = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const groups =
    g.groups.length > 0 ? g.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
  const capMaterial = Math.max(...groups.map((x) => x.materialIndex ?? 0)) + 1;
  const halves = { above: builder(), below: builder() };

  const vertex = (i: number): Vertex => ({
    p: new THREE.Vector3().fromBufferAttribute(pos, i),
    n: nor === undefined ? new THREE.Vector3() : new THREE.Vector3().fromBufferAttribute(nor, i),
    uv: tex === undefined ? new THREE.Vector2() : new THREE.Vector2().fromBufferAttribute(tex, i),
  });

  for (const group of groups) {
    const material = group.materialIndex ?? 0;
    const end = Math.min(pos.count, group.start + group.count);
    for (let i = group.start; i + 2 < end; i += 3) {
      const tri = [vertex(i), vertex(i + 1), vertex(i + 2)];
      // a point exactly on the plane counts as above: every triangle is then wholly on one side or crosses it
      const d = tri.map((v) => {
        const s = plane.distanceToPoint(v.p);
        return Math.abs(s) < EPS ? EPS : s;
      });
      if (d.every((x) => x > 0)) push(halves.above, material, tri);
      else if (d.every((x) => x < 0)) push(halves.below, material, tri);
      else {
        clip(tri, d, 1, halves.above, material);
        clip(tri, d, -1, halves.below, material);
      }
    }
  }

  return {
    above: finish(halves.above, plane, -1, capMaterial, tex !== undefined),
    below: finish(halves.below, plane, 1, capMaterial, tex !== undefined),
    capMaterial,
  };
}

function builder(): Builder {
  return { position: [], normal: [], uv: [], byMaterial: new Map(), segments: [] };
}

function push(b: Builder, material: number, tri: readonly Vertex[]): void {
  const list = b.byMaterial.get(material) ?? [];
  list.push(...tri);
  b.byMaterial.set(material, list);
}

/** The point where the edge a–b crosses the plane, computed the same way whichever triangle the edge belongs to. */
function crossing(a: Vertex, b: Vertex, da: number, db: number): Vertex {
  const swap = order(a.p, b.p) > 0;
  const [u, v, du, dv] = swap ? [b, a, db, da] : [a, b, da, db];
  const t = du / (du - dv);
  return {
    p: u.p.clone().lerp(v.p, t),
    n: u.n.clone().lerp(v.n, t).normalize(),
    uv: u.uv.clone().lerp(v.uv, t),
  };
}

function order(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.x - b.x || a.y - b.y || a.z - b.z;
}

/** The part of the triangle on side `s` (Sutherland–Hodgman against one plane), fanned into triangles; its cut edge recorded. */
function clip(
  tri: readonly Vertex[],
  d: readonly number[],
  s: 1 | -1,
  b: Builder,
  material: number,
): void {
  const out: Vertex[] = [];
  const cut: THREE.Vector3[] = [];
  for (let k = 0; k < 3; k += 1) {
    const a = tri[k] as Vertex;
    const c = tri[(k + 1) % 3] as Vertex;
    const da = (d[k] as number) * s;
    const dc = (d[(k + 1) % 3] as number) * s;
    if (da > 0) out.push(a);
    if (da > 0 !== dc > 0) {
      const x = crossing(a, c, d[k] as number, d[(k + 1) % 3] as number);
      out.push(x);
      cut.push(x.p);
    }
  }
  for (let k = 1; k + 1 < out.length; k += 1)
    push(b, material, [out[0] as Vertex, out[k] as Vertex, out[k + 1] as Vertex]);
  if (cut.length === 2) b.segments.push([cut[0] as THREE.Vector3, cut[1] as THREE.Vector3]);
}

function key(p: THREE.Vector3): string {
  return `${Math.round(p.x * KEY)},${Math.round(p.y * KEY)},${Math.round(p.z * KEY)}`;
}

/** The cut's segments joined into closed loops (an open chain, where the surface itself is open, is dropped). */
function loops(segments: readonly [THREE.Vector3, THREE.Vector3][]): THREE.Vector3[][] {
  const at = new Map<string, number[]>();
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = key(p);
      at.set(k, [...(at.get(k) ?? []), i]);
    }
  });
  const used = new Set<number>();
  const out: THREE.Vector3[][] = [];
  for (let s = 0; s < segments.length; s += 1) {
    if (used.has(s)) continue;
    used.add(s);
    const [first, second] = segments[s] as [THREE.Vector3, THREE.Vector3];
    const loop = [first];
    let here = second;
    let closed = false;
    for (;;) {
      if (key(here) === key(first)) {
        closed = true;
        break;
      }
      loop.push(here);
      const next = (at.get(key(here)) ?? []).find((i) => !used.has(i));
      if (next === undefined) break;
      used.add(next);
      const [a, b] = segments[next] as [THREE.Vector3, THREE.Vector3];
      here = key(a) === key(here) ? b : a;
    }
    if (closed && loop.length >= 3) out.push(loop);
  }
  return out;
}

function inside(p: THREE.Vector2, poly: readonly THREE.Vector2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i] as THREE.Vector2;
    const b = poly[j] as THREE.Vector2;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}

/** The half's surface, then its caps: the loops filled (a loop inside another is a hole in it), facing `facing` × the normal. */
function finish(
  b: Builder,
  plane: THREE.Plane,
  facing: 1 | -1,
  capMaterial: number,
  hasUv: boolean,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const add = (v: Vertex): void => {
    b.position.push(v.p.x, v.p.y, v.p.z);
    b.normal.push(v.n.x, v.n.y, v.n.z);
    b.uv.push(v.uv.x, v.uv.y);
  };
  for (const [material, verts] of [...b.byMaterial.entries()].sort((x, y) => x[0] - y[0])) {
    geometry.addGroup(b.position.length / 3, verts.length, material);
    for (const v of verts) add(v);
  }

  // the plane's own 2D frame
  const n = plane.normal.clone().normalize();
  const u = new THREE.Vector3(1, 0, 0).cross(n);
  if (u.lengthSq() < 1e-6) u.set(0, 1, 0).cross(n);
  u.normalize();
  const w = n.clone().cross(u);
  const to2 = (p: THREE.Vector3): THREE.Vector2 => new THREE.Vector2(p.dot(u), p.dot(w));
  const out = n.clone().multiplyScalar(facing);

  const rings = loops(b.segments).map((l) => ({ l, flat: l.map(to2) }));
  rings.sort(
    (x, y) => Math.abs(THREE.ShapeUtils.area(y.flat)) - Math.abs(THREE.ShapeUtils.area(x.flat)),
  );
  const depth = rings.map(
    (r, i) => rings.filter((o, j) => j !== i && inside(r.flat[0] as THREE.Vector2, o.flat)).length,
  );
  const start = b.position.length / 3;
  rings.forEach((outer, i) => {
    if ((depth[i] as number) % 2 === 1) return;
    const holes = rings.filter(
      (h, j) =>
        depth[j] === (depth[i] as number) + 1 && inside(h.flat[0] as THREE.Vector2, outer.flat),
    );
    const points = [...outer.l, ...holes.flatMap((h) => h.l)];
    const tris = THREE.ShapeUtils.triangulateShape(
      outer.flat,
      holes.map((h) => h.flat),
    );
    for (const t of tris) {
      const [a, c, e] = t.map((k) => points[k] as THREE.Vector3) as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
      ];
      const faces = c.clone().sub(a).cross(e.clone().sub(a)).dot(out) >= 0;
      for (const p of faces ? [a, c, e] : [a, e, c]) {
        const q = plane.projectPoint(p, new THREE.Vector3());
        const f = to2(q);
        add({ p: q, n: out, uv: new THREE.Vector2(f.x, f.y) });
      }
    }
  });
  const capCount = b.position.length / 3 - start;
  if (capCount > 0) geometry.addGroup(start, capCount, capMaterial);

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
  if (hasUv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  return geometry;
}
