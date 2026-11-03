/** Which rules slider (sliders.ts) a glTF node is: SLIDER_<k> is slider k; any other name, none. */
export function sliderNodeIndex(name: string): number | null {
  const m = /^SLIDER_(\d+)$/.exec(name);
  return m === null ? null : Number(m[1]);
}

/** How far a slider's node has moved from home, in scene units: its run (world units) times its progress, through the map's space. */
export function sliderOffset(
  slid: { readonly progress: number; readonly by: { readonly x: number; readonly y: number } },
  toScene: (x: number, y: number) => { readonly x: number; readonly z: number },
): { x: number; z: number } {
  const a = toScene(0, 0);
  const b = toScene(slid.by.x, slid.by.y);
  return { x: (b.x - a.x) * slid.progress + 0, z: (b.z - a.z) * slid.progress + 0 }; // (+ 0: no negative zero)
}
