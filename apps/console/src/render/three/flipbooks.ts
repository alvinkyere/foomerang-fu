import * as THREE from 'three';

/**
 * The reference video's own effects, played back frame by frame (owner, 2026-10-21: the video is the owner's own; the effects
 * must be exactly its). Each flipbook was cut out of the video by `art/physics_reference/vfx_extract.py`: its frames in a grid
 * of an RGBA atlas at the video's 30 fps, with how many character widths one frame spans, so it is drawn at the video's size
 * against our characters. A ground flipbook lies flat; the others face the camera, drawn over the scene as the video's are. A
 * tintable one (white where the video had the power's colour) takes the colour it is played with; a looping one repeats until
 * it is stopped.
 */
export interface FlipbookMeta {
  readonly name: string;
  readonly fps: number;
  readonly frames: number;
  readonly cols: number;
  readonly rows: number;
  /** Character widths one frame spans. */
  readonly widths: number;
  readonly ground: boolean;
  readonly tintable: boolean;
  readonly loop?: boolean;
  /** A ground ring: its radius at the end, as a fraction of a frame's width. */
  readonly ringRadius?: number;
}

/** Frame `t` seconds into a flipbook; undefined once it is over (never, for a loop). */
export function flipbookFrame(meta: FlipbookMeta, t: number): number | undefined {
  if (t < 0) return 0;
  const k = Math.floor(t * meta.fps);
  if (meta.loop === true) return k % meta.frames;
  return k >= meta.frames ? undefined : k;
}

/** Where frame `k` sits in its atlas (texture offset, bottom-left origin). */
export function frameOffset(
  meta: FlipbookMeta,
  k: number,
): { readonly x: number; readonly y: number } {
  const col = k % meta.cols;
  const row = Math.floor(k / meta.cols);
  return { x: col / meta.cols, y: 1 - (row + 1) / meta.rows };
}

interface Book {
  readonly meta: FlipbookMeta;
  readonly texture: THREE.Texture;
}

export interface Played {
  readonly object: THREE.Mesh | THREE.Sprite;
  readonly texture: THREE.Texture;
  readonly meta: FlipbookMeta;
  readonly born: number;
}

export interface PlayOptions {
  readonly tint?: THREE.ColorRepresentation;
  /** The frame's width in scene units, instead of the video's size (`meta.widths` × `w`). */
  readonly size?: number;
  /** Where in the frame the point `at` is (0–1, bottom-left origin). Default the middle. */
  readonly centre?: { readonly x: number; readonly y: number };
}

export class Flipbooks {
  readonly #books = new Map<string, Book>();
  readonly #playing: Played[] = [];
  readonly #plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  constructor(readonly scene: THREE.Scene) {}

  /** Loads the flipbooks (`<base>/<name>.webp` + `.json`); a missing one is simply not played. */
  async load(base: string, names: readonly string[]): Promise<void> {
    const loader = new THREE.TextureLoader();
    await Promise.all(
      names.map(async (name) => {
        try {
          const res = await fetch(`${base}/${name}.json`);
          if (!res.ok) return;
          const meta = (await res.json()) as FlipbookMeta;
          if (!(meta.frames > 0 && meta.cols > 0 && meta.rows > 0 && meta.fps > 0)) return;
          const texture = await loader.loadAsync(`${base}/${name}.webp`);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.repeat.set(1 / meta.cols, 1 / meta.rows);
          this.#books.set(name, { meta, texture });
        } catch {
          // (no flipbook: the effect is simply not drawn)
        }
      }),
    );
  }

  has(name: string): boolean {
    return this.#books.has(name);
  }

  meta(name: string): FlipbookMeta | undefined {
    return this.#books.get(name)?.meta;
  }

  /** The atlas of `name` itself (to share, e.g. with an instanced layer). */
  atlas(name: string): THREE.Texture | undefined {
    return this.#books.get(name)?.texture;
  }

  /** A copy of frame `k` of `name` as its own texture (a still: the ice block). */
  still(name: string, k = 0): THREE.Texture | undefined {
    const book = this.#books.get(name);
    if (book === undefined) return undefined;
    const t = book.texture.clone();
    const o = frameOffset(book.meta, Math.min(k, book.meta.frames - 1));
    t.offset.set(o.x, o.y);
    t.needsUpdate = true;
    return t;
  }

  /** Plays `name` at the scene point `at`, `w` scene units to a character width. Returns it (to move or stop a loop). */
  play(
    name: string,
    at: THREE.Vector3,
    w: number,
    now: number,
    options: PlayOptions = {},
  ): Played | undefined {
    const book = this.#books.get(name);
    if (book === undefined) return undefined;
    const texture = book.texture.clone();
    texture.needsUpdate = true;
    const size = options.size ?? book.meta.widths * w;
    const colour = book.meta.tintable && options.tint !== undefined ? options.tint : 0xffffff;
    let object: THREE.Mesh | THREE.Sprite;
    if (book.meta.ground) {
      object = new THREE.Mesh(
        this.#plane,
        new THREE.MeshBasicMaterial({
          map: texture,
          color: colour,
          transparent: true,
          depthWrite: false,
        }),
      );
      object.scale.set(size, 1, size);
      object.position.set(at.x, 0.11, at.z);
    } else {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          color: colour,
          transparent: true,
          depthWrite: false,
          depthTest: false,
        }),
      );
      sprite.scale.set(size, size, 1);
      if (options.centre !== undefined) sprite.center.set(options.centre.x, options.centre.y);
      sprite.position.copy(at);
      object = sprite;
    }
    object.renderOrder = 4;
    this.scene.add(object);
    const played: Played = { object, texture, meta: book.meta, born: now };
    this.#playing.push(played);
    this.#show(played, now);
    return played;
  }

  /** Stops a playing flipbook (a loop) at once. */
  stop(played: Played): void {
    const i = this.#playing.indexOf(played);
    if (i >= 0) this.#remove(i);
  }

  frame(now: number): void {
    for (let i = this.#playing.length - 1; i >= 0; i -= 1)
      if (!this.#show(this.#playing[i] as Played, now)) this.#remove(i);
  }

  #remove(i: number): void {
    const p = this.#playing[i] as Played;
    this.scene.remove(p.object);
    p.texture.dispose();
    (p.object.material as THREE.Material).dispose();
    this.#playing.splice(i, 1);
  }

  #show(p: Played, now: number): boolean {
    const k = flipbookFrame(p.meta, (now - p.born) / 1000);
    if (k === undefined) return false;
    const o = frameOffset(p.meta, k);
    p.texture.offset.set(o.x, o.y);
    return true;
  }

  get count(): number {
    return this.#playing.length;
  }
}
