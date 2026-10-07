import { describe, expect, it, vi } from 'vitest';
import { FocusController } from '../../src/shell/focus/FocusController';

function el(id: string, x: number, y: number, w = 100, h = 100): HTMLElement {
  const node = document.createElement('button');
  node.dataset['focusId'] = id;
  node.getBoundingClientRect = () => ({
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  });
  document.body.append(node);
  return node;
}

function setup() {
  const c = new FocusController(() => undefined);
  const a = el('a', 0, 0);
  const b = el('b', 200, 0);
  const d = el('d', 0, 200);
  c.registerScope('home', {});
  c.registerItem('home', 'a', a);
  c.registerItem('home', 'b', b);
  c.registerItem('home', 'd', d);
  return { c, a, b, d };
}

describe('FocusController', () => {
  it('puts focus on the requested initial item, else the first registered one (never nowhere)', () => {
    const { c, a, b } = setup();
    c.focusInitial('home');
    expect(document.activeElement).toBe(a);
    c.focusInitial('home', 'b', false);
    expect(document.activeElement).toBe(b);
  });

  it('remembers where focus was when a scope is left and entered again', () => {
    const { c, b } = setup();
    c.focusInitial('home', 'b');
    c.noteFocus('home', 'b');
    c.focusInitial('home', 'a'); // remembered b wins over the default
    expect(document.activeElement).toBe(b);
  });

  it('navigates spatially and recovers when nothing is focused', () => {
    const { c, a, b, d } = setup();
    (document.activeElement as HTMLElement | null)?.blur();
    c.handle('right'); // nothing focused: lands on a deterministic target instead of doing nothing
    expect(document.activeElement).toBe(a);
    c.handle('right');
    expect(document.activeElement).toBe(b);
    c.handle('left');
    c.handle('down');
    expect(document.activeElement).toBe(d);
  });

  it('select clicks the focused element', () => {
    const { c, a } = setup();
    const onClick = vi.fn();
    a.addEventListener('click', onClick);
    c.focusInitial('home');
    c.handle('select');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('only the top scope receives input, and back pops through its handler', () => {
    const { c, a } = setup();
    c.focusInitial('home');
    const onBack = vi.fn();
    const m = el('m1', 0, 0);
    const n = el('m2', 0, 150);
    c.registerScope('modal', { onBack });
    c.registerItem('modal', 'm1', m);
    c.registerItem('modal', 'm2', n);
    c.focusInitial('modal');
    c.handle('down');
    expect(document.activeElement).toBe(n);
    c.handle('back');
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(a);
  });

  it('restores the last focused item of a scope when it becomes active again', () => {
    const { c, b } = setup();
    c.focusInitial('home', 'b');
    const unregister = c.registerScope('modal', {});
    const m = el('m1', 0, 0);
    c.registerItem('modal', 'm1', m);
    c.focusInitial('modal');
    unregister();
    expect(document.activeElement).toBe(b);
  });

  it('left/right is offered to the focused item first (a settings row changes its value)', () => {
    const { c, a } = setup();
    const onNavigate = vi.fn(() => true);
    c.registerItem('home', 'a', a, { onNavigate });
    c.focusInitial('home', 'a');
    c.handle('right');
    expect(onNavigate).toHaveBeenCalledWith('right');
    expect(document.activeElement).toBe(a);
  });

  it('skips disabled elements', () => {
    const { c, a, b } = setup();
    (b as HTMLButtonElement).disabled = true;
    c.focusInitial('home', 'a');
    c.handle('right');
    expect(document.activeElement).toBe(a);
  });

  it('a button that is unavailable stays focusable (so it can say why) but cannot be selected', () => {
    const emitted: string[] = [];
    const c = new FocusController((cue) => emitted.push(cue));
    const x = el('x', 0, 0);
    x.setAttribute('aria-disabled', 'true');
    const onClick = vi.fn();
    x.addEventListener('click', onClick);
    c.registerScope('s', {});
    c.registerItem('s', 'x', x);
    c.focusInitial('s');
    expect(document.activeElement).toBe(x);
    c.handle('select');
    expect(onClick).not.toHaveBeenCalled();
    expect(emitted).toContain('error');
  });

  it('reports the input device that was last used', () => {
    const { c } = setup();
    const seen: string[] = [];
    c.subscribe(() => seen.push(c.device));
    c.handle('down', 'gamepad');
    expect(c.device).toBe('gamepad');
    c.notePointer();
    expect(c.device).toBe('pointer');
  });
});
