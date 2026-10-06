/**
 * A tiny route planner for walking a player round the primitive arena's walls in the browser tests.
 * The nodes are places a body can stand and the edges are straight lines known to be clear of every
 * wall for a body 36 units in radius (checked by hand against PRIMITIVE_ARENA and by the tests that use
 * them: a wrong edge makes a test fail, it cannot make one pass).
 */
export type Point = { x: number; y: number };

export const NODES: Readonly<Record<string, Point>> = {
  topLeft: { x: 110, y: 100 },
  topGate: { x: 800, y: 100 },
  topRight: { x: 1490, y: 100 },
  leftLane: { x: 110, y: 450 },
  rightLane: { x: 1490, y: 450 },
  bottomLeft: { x: 110, y: 800 },
  bottomGate: { x: 800, y: 800 },
  bottomRight: { x: 1490, y: 800 },
  // the open lane between the gate walls and the cover blocks
  upperLane: { x: 800, y: 255 },
  upperLeft: { x: 460, y: 255 },
  upperRight: { x: 1140, y: 255 },
  // the four pickup spots
  spotNorth: { x: 800, y: 295 },
  spotSouth: { x: 800, y: 605 },
  spotWest: { x: 460, y: 450 },
  spotEast: { x: 1140, y: 450 },
};

const EDGES: [string, string][] = [
  ['topLeft', 'topGate'],
  ['topGate', 'topRight'],
  ['topLeft', 'leftLane'],
  ['leftLane', 'bottomLeft'],
  ['topRight', 'rightLane'],
  ['rightLane', 'bottomRight'],
  ['bottomLeft', 'bottomGate'],
  ['bottomGate', 'bottomRight'],
  ['topGate', 'upperLane'],
  ['upperLane', 'spotNorth'],
  ['upperLane', 'upperLeft'],
  ['upperLane', 'upperRight'],
  ['upperLeft', 'spotWest'],
  ['upperRight', 'spotEast'],
  ['bottomGate', 'spotSouth'],
];

const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** The waypoints from where a player is to the named node (shortest by hops, then by length). */
export function routeTo(from: Point, target: keyof typeof NODES): Point[] {
  const names = Object.keys(NODES);
  const start = names.reduce((best, n) =>
    near(NODES[n] as Point, from) < near(NODES[best] as Point, from) ? n : best,
  );
  const neighbours = (n: string) => EDGES.flatMap(([a, b]) => (a === n ? [b] : b === n ? [a] : []));
  const queue: string[][] = [[start]];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const path = queue.shift() as string[];
    const last = path.at(-1) as string;
    if (last === target) return path.map((n) => NODES[n] as Point);
    for (const next of neighbours(last)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  throw new Error(`no route to ${String(target)}`);
}
