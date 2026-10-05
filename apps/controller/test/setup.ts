import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no PointerEvent. This minimal stand-in carries what the controller reads, so tests
// drive the REAL pointer-event code path (not a test-only shortcut).
class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'touch';
    this.isPrimary = init.isPrimary ?? true;
  }
}
Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEventPolyfill });

// Pointer capture does not exist in jsdom either.
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => true);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
