const MAX_CODE_POINTS = 16;
// Cheap guard so a multi-megabyte name is rejected before any real work. Generous: even 16
// astral characters are only 32 UTF-16 units, plus room for surrounding whitespace.
const MAX_RAW_LENGTH = 64;

// Control (Cc), format (Cf: zero-width, bidi overrides), line/paragraph separators (Zl, Zp).
// Blocks text-spoofing on the shared screen. Deliberately structural — no moderation policy yet.
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** Returns the trimmed name, or `undefined` if it violates the structural limits. */
export function validateDisplayName(input: string): string | undefined {
  if (input.length > MAX_RAW_LENGTH) return undefined;
  const name = input.trim();
  if (name.length === 0 || FORBIDDEN.test(name)) return undefined;
  return [...name].length <= MAX_CODE_POINTS ? name : undefined;
}
