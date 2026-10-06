import type { Snapshot } from './fixtures';

declare global {
  interface Window {
    __FOOMERANG__?: { snapshot(): Snapshot };
    /** The development showcase (apps/console/src/showcase): scripted scenarios through the real rules and renderer. */
    __SHOWCASE__?: {
      scenarios: { name: string; about: string; seconds: number }[];
      reset(name: string): Promise<void>;
      frame(n: number): void;
      play(name: string): Promise<void>;
    };
  }
}
