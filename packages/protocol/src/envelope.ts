import { z } from 'zod';

/**
 * Envelopes are designed by message *semantics*, not as one universal packet. Each class carries
 * only the metadata it needs:
 *
 *   plain    { type, payload }                    handshake, errors, ...
 *   state    { type, seq, payload }               latest-wins input state (movement)
 *   event    { type, seq, eventId, payload }      reliable, deduplicated input events (actions)
 *   (heartbeat has its own shape, see heartbeat.ts)
 *
 * The protocol version is negotiated ONCE per connection in the handshake, not repeated on every
 * message (inputs flow at 30–60 Hz).
 */

/** Per-connection, per-stream sequence number: unsigned 32-bit. Wraparound is not supported (~2 years at 60 Hz). */
export const SEQ_MAX = 4_294_967_295;
export const seqSchema = z.number().int().min(0).max(SEQ_MAX);

/**
 * Client-generated identifier, unique per event within a session; the receiver deduplicates on it.
 * Intentionally not a UUID: crypto.randomUUID() does not exist in insecure contexts (a phone
 * loading the controller over plain HTTP on a LAN).
 */
export const eventIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

// Strict objects everywhere: unknown keys are rejected, not silently stripped.
export const plainEnvelope = <TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) => z.strictObject({ type: z.literal(type), payload });

export const stateEnvelope = <TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) => z.strictObject({ type: z.literal(type), seq: seqSchema, payload });

export const eventEnvelope = <TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) => z.strictObject({ type: z.literal(type), seq: seqSchema, eventId: eventIdSchema, payload });
