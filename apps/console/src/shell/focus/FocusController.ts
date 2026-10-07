import type { SoundCue } from '../sound';
import type { ConsoleAction } from './inputMap';
import { pickNext, type Direction, type FocusRect } from './navigation';

export type InputDevice = 'keyboard' | 'gamepad' | 'pointer';

export interface ScopeOptions {
  /** Called when the player presses Back (Esc / B) while this scope is on top. */
  readonly onBack?: (() => void) | undefined;
}

export interface ItemOptions {
  /** Offered a direction first; return true to consume it (a settings row changing its value). */
  readonly onNavigate?: ((direction: Direction) => boolean) | undefined;
}

interface Item {
  readonly el: HTMLElement;
  readonly options: ItemOptions;
}
interface Scope {
  readonly id: string;
  options: ScopeOptions;
  readonly items: Map<string, Item>;
}

/**
 * The console's one focus system. Real DOM focus (so assistive tech and the mouse agree with it),
 * driven by a device-independent action vocabulary. Scopes form a stack: only the top scope hears
 * input, Back leaves it, and the scope underneath gets its last focus restored — so focus always
 * has a deterministic home and there is always a way out. No React in here.
 */
export class FocusController {
  readonly #scopes: Scope[] = [];
  /** Items register before their scope does (children attach first), so records live apart from the stack. */
  readonly #records = new Map<string, Scope>();
  /** Last focused item per scope id. Outlives the scope, so leaving a screen and coming back lands where you were. */
  readonly #memory = new Map<string, string>();
  readonly #listeners = new Set<() => void>();
  readonly #emit: (cue: SoundCue) => void;
  #device: InputDevice = 'keyboard';
  #version = 0;

  constructor(emit: (cue: SoundCue) => void) {
    this.#emit = emit;
  }

  get device(): InputDevice {
    return this.#device;
  }
  /** Changes whenever the scope stack or input device does (for useSyncExternalStore). */
  get version(): number {
    return this.#version;
  }
  get activeScopeId(): string | undefined {
    return this.#scopes.at(-1)?.id;
  }
  isActive(scopeId: string): boolean {
    return this.activeScopeId === scopeId;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };
  #changed(): void {
    this.#version += 1;
    for (const l of [...this.#listeners]) l();
  }

  registerScope(id: string, options: ScopeOptions): () => void {
    const scope = this.#record(id);
    scope.options = options;
    this.#scopes.push(scope);
    this.#changed();
    return () => {
      const index = this.#scopes.indexOf(scope);
      if (index < 0) return;
      const wasTop = index === this.#scopes.length - 1;
      this.#scopes.splice(index, 1);
      if (this.#records.get(id) === scope) this.#records.delete(id);
      if (wasTop) this.#restore(this.#scopes.at(-1));
      this.#changed();
    };
  }
  setScopeOptions(id: string, options: ScopeOptions): void {
    const scope = this.#records.get(id);
    if (scope) scope.options = options;
  }
  #record(id: string): Scope {
    let scope = this.#records.get(id);
    if (scope === undefined) {
      scope = { id, options: {}, items: new Map() };
      this.#records.set(id, scope);
    }
    return scope;
  }

  registerItem(
    scopeId: string,
    id: string,
    el: HTMLElement,
    options: ItemOptions = {},
  ): () => void {
    const scope = this.#record(scopeId);
    scope.items.set(id, { el, options });
    return () => {
      if (scope.items.get(id)?.el === el) scope.items.delete(id);
    };
  }

  /** Records focus so the scope can restore it later. Called from focusin. */
  noteFocus(scopeId: string, id: string): void {
    this.#memory.set(scopeId, id);
  }

  /** Focus for a scope: its remembered item (unless `remember` is false), else `preferred`, else the first. */
  focusInitial(scopeId: string, preferred?: string, remember = true): void {
    const scope = this.#records.get(scopeId);
    if (scope === undefined) return;
    const ids = this.#focusable(scope);
    const target = [remember ? this.#memory.get(scopeId) : undefined, preferred].find(
      (id) => id !== undefined && ids.includes(id),
    );
    this.#focus(scope, target ?? ids[0]);
  }

  notePointer(): void {
    if (this.#device === 'pointer') return;
    this.#device = 'pointer';
    this.#changed();
  }

  handle(action: ConsoleAction, source: InputDevice = 'keyboard'): void {
    if (this.#device !== source) {
      this.#device = source;
      this.#changed();
    }
    const scope = this.#scopes.at(-1);
    if (scope === undefined) return;

    if (action === 'back') {
      if (scope.options.onBack) {
        this.#emit('back');
        scope.options.onBack();
      }
      return;
    }

    const current = this.#currentId(scope);
    if (action === 'select') {
      const item = current === undefined ? undefined : scope.items.get(current);
      if (
        item === undefined ||
        (item.el as HTMLButtonElement).disabled === true ||
        item.el.getAttribute('aria-disabled') === 'true'
      ) {
        this.#emit('error');
        return;
      }
      this.#press(item.el);
      this.#emit('select');
      item.el.click();
      return;
    }

    if (current === undefined) {
      this.focusInitial(scope.id); // lost focus (its element unmounted): recover deterministically
      return;
    }
    if (scope.items.get(current)?.options.onNavigate?.(action) === true) {
      this.#emit('move');
      return;
    }
    const ids = this.#focusable(scope);
    const rects: FocusRect[] = ids.map((id) => {
      const r = (scope.items.get(id) as Item).el.getBoundingClientRect();
      return { id, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const next = pickNext(rects, current, action);
    if (next !== undefined && next !== current) {
      this.#focus(scope, next);
      this.#emit('move');
    }
  }

  #focusable(scope: Scope): string[] {
    return [...scope.items.entries()]
      .filter(([, item]) => item.el.isConnected && (item.el as HTMLButtonElement).disabled !== true)
      .sort(([, a], [, b]) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
      .map(([id]) => id);
  }
  #currentId(scope: Scope): string | undefined {
    const active = document.activeElement;
    for (const [id, item] of scope.items) if (item.el === active) return id;
    return undefined;
  }
  #focus(scope: Scope, id: string | undefined): void {
    if (id === undefined) return;
    const item = scope.items.get(id);
    if (item === undefined) return;
    this.#memory.set(scope.id, id);
    item.el.focus({ preventScroll: true });
  }
  #restore(scope: Scope | undefined): void {
    if (scope !== undefined) this.focusInitial(scope.id);
  }
  #press(el: HTMLElement): void {
    el.dataset['pressed'] = 'true';
    setTimeout(() => delete el.dataset['pressed'], 140);
  }
}
