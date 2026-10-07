import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { soundHooks } from '../sound';
import { FocusController, type InputDevice, type ItemOptions } from './FocusController';
import { GamepadMapper, keyToAction, type ConsoleAction } from './inputMap';

const ControllerContext = createContext<FocusController | null>(null);
const ScopeContext = createContext<string>('root');

export function useFocusController(): FocusController {
  const controller = useContext(ControllerContext);
  if (controller === null) throw new Error('FocusManager is missing');
  return controller;
}

/** The device the player last used, for control glyphs (A / Enter) and nothing else. */
export function useInputDevice(): InputDevice {
  const controller = useFocusController();
  useSyncExternalStore(controller.subscribe, () => controller.version);
  return controller.device;
}

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);

/** What a remote controller (a phone) can ask of the console: the same vocabulary as any device, plus the one secondary button. */
export type RemoteAction = ConsoleAction | 'secondary';

/**
 * A source of remote console input, already translated by the host (stick → steps, SLASH → select,
 * THROW → back, DASH → secondary). The shell does not know what is on the other end.
 */
export interface RemoteInput {
  subscribe(listener: (action: RemoteAction) => void): () => void;
}

/**
 * Owns the one FocusController, and feeds it from the keyboard, the mouse, any gamepad and the
 * phones (`remote`). Every device drives the same focus: no device has a menu of its own. Mount it
 * once, above every screen.
 */
export function FocusManager({
  children,
  remote,
}: {
  readonly children: ReactNode;
  readonly remote?: RemoteInput | undefined;
}) {
  const [controller] = useState(() => new FocusController((cue) => soundHooks.emit(cue)));

  useEffect(() => {
    if (remote === undefined) return undefined;
    return remote.subscribe((action) => {
      // No screen offers a secondary action yet; when one does, it is wired here, not invented.
      if (action === 'secondary') return;
      controller.handle(action, 'phone');
    });
  }, [controller, remote]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextEntry(e.target)) return;
      const action = keyToAction(e.key);
      if (action === undefined) return;
      e.preventDefault(); // stops the browser's own Enter/Space click and page scrolling
      if (e.repeat && (action === 'select' || action === 'back')) return;
      controller.handle(action, 'keyboard');
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (keyToAction(e.key) !== undefined && !isTextEntry(e.target)) e.preventDefault();
    };
    const onPointer = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse') controller.notePointer();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointer, { passive: true });

    const mapper = new GamepadMapper();
    let frame = 0;
    const poll = (now: number): void => {
      const pad = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      for (const p of pad) {
        if (p?.connected !== true) continue;
        for (const action of mapper.poll(p, now)) controller.handle(action, 'gamepad');
        break; // one pad drives the shell
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointer);
      cancelAnimationFrame(frame);
    };
  }, [controller]);

  useEffect(() => {
    document.documentElement.dataset['input'] = controller.device;
    return controller.subscribe(() => {
      document.documentElement.dataset['input'] = controller.device;
    });
  }, [controller]);

  return <ControllerContext.Provider value={controller}>{children}</ControllerContext.Provider>;
}

export interface FocusScopeProps {
  readonly id: string;
  /** False while a closing animation plays: the scope has already handed input back. */
  readonly active?: boolean;
  readonly onBack?: (() => void) | undefined;
  /** Where focus lands when the scope opens. If omitted, the first item. */
  readonly initialFocus?: string;
  /** Restore where focus last was in this scope (default), or always start at `initialFocus`. */
  readonly remember?: boolean;
  readonly children: ReactNode;
}

/** A screen or overlay: owns a set of focus targets, hears input only while it is on top. */
export function FocusScope({
  id,
  active = true,
  onBack,
  initialFocus,
  remember = true,
  children,
}: FocusScopeProps) {
  const controller = useFocusController();
  useSyncExternalStore(controller.subscribe, () => controller.version);
  const onBackRef = useRef(onBack);
  useLayoutEffect(() => {
    onBackRef.current = onBack;
  });

  useLayoutEffect(() => {
    if (!active) return undefined;
    const off = controller.registerScope(id, { onBack: () => onBackRef.current?.() });
    controller.focusInitial(id, initialFocus, remember);
    return off;
  }, [controller, id, active, initialFocus, remember]);

  // The scope underneath was inert while covered; once it is on top again, take focus back.
  const top = active && controller.isActive(id);
  useEffect(() => {
    if (top && !document.activeElement?.closest('[data-scope-id="' + id + '"]')) {
      controller.focusInitial(id, initialFocus, true); // coming back: where you were, never the default
    }
  }, [top, controller, id, initialFocus]);

  // If the focused thing disappeared (a seat that was empty is now taken), focus is nowhere: put it
  // somewhere deterministic at once, so Select / the arrows always have a target.
  useEffect(() => {
    const none = document.activeElement === null || document.activeElement === document.body;
    if (top && none) controller.focusInitial(id, initialFocus, true);
  });

  return (
    <ScopeContext.Provider value={id}>
      <div className="scope" data-scope-id={id} inert={!top}>
        {children}
      </div>
    </ScopeContext.Provider>
  );
}

/** Registers the element as a focus target of the enclosing scope. Spread the result on a button. */
export function useFocusItem<T extends HTMLElement>(id: string, options: ItemOptions = {}) {
  const controller = useFocusController();
  const scopeId = useContext(ScopeContext);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const ref = useCallback(
    (el: T | null) => {
      if (el === null) return undefined;
      const off = controller.registerItem(scopeId, id, el, {
        onNavigate: (d) => optionsRef.current.onNavigate?.(d) ?? false,
      });
      const onFocus = (): void => controller.noteFocus(scopeId, id);
      const onMove = (e: PointerEvent): void => {
        if (e.pointerType !== 'mouse') return;
        controller.notePointer();
        if (
          controller.isActive(scopeId) &&
          document.activeElement !== el &&
          !(el as HTMLElement & { disabled?: boolean }).disabled
        ) {
          el.focus({ preventScroll: true });
        }
      };
      el.addEventListener('focus', onFocus);
      el.addEventListener('pointermove', onMove);
      return () => {
        off();
        el.removeEventListener('focus', onFocus);
        el.removeEventListener('pointermove', onMove);
      };
    },
    [controller, scopeId, id],
  );
  return { ref, 'data-focus-id': id } as const;
}
