import { describe, expect, it } from 'vitest';
import config from '../vite.config';

describe('which environment variables reach the page', () => {
  const prefixes = ([config.envPrefix ?? []] as (string | string[])[]).flat();
  const exposed = (name: string): boolean => prefixes.some((prefix) => name.startsWith(prefix));

  it('exposes the two address variables (URLs, never secrets)', () => {
    expect(exposed('FOOMERANG_CONTROLLER_URL')).toBe(true);
    expect(exposed('FOOMERANG_SERVER_URL')).toBe(true);
  });

  it('never exposes TLS key or certificate locations, or anything else FOOMERANG_*', () => {
    for (const name of [
      'FOOMERANG_TLS_KEY',
      'FOOMERANG_TLS_CERT',
      'FOOMERANG_SECRET',
      'FOOMERANG_ANYTHING',
    ]) {
      expect(exposed(name), name).toBe(false);
    }
  });
});
