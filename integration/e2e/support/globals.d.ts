import type { Snapshot } from './fixtures';

declare global {
  interface Window {
    __FOOMERANG__?: { snapshot(): Snapshot };
  }
}
