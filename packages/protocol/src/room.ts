import { z } from 'zod';

/**
 * Human-friendly join code: six characters, no 0 O 1 I L. 31^6 ≈ 887M combinations.
 *
 * The protocol owns only the *representation*. Generating an available code (and handling
 * collisions against active rooms) is room-engine behavior.
 */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export type JoinCode = string;

// Deliberately validated BEFORE any case folding, and against ASCII only: calling
// toUpperCase() on arbitrary Unicode would let 'ſ' (→ 'S') or 'ß' (→ 'SS') slip through.
const JOIN_CODE_PATTERN = new RegExp(
  `^[${JOIN_CODE_ALPHABET}${JOIN_CODE_ALPHABET.toLowerCase()}]{${JOIN_CODE_LENGTH}}$`,
);

/** Accepts any ASCII case; yields the canonical uppercase form. */
export const joinCodeSchema = z
  .string()
  .regex(JOIN_CODE_PATTERN)
  .transform((code): JoinCode => code.toUpperCase());
