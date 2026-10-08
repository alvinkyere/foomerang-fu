import { z } from 'zod';

/** Server-issued ids are UUIDs today; the wire accepts any short, URL-safe opaque id. */
const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/**
 * A phone's membership of a console session. Survives game launches and Home. Branded so it can
 * never be passed where a game session id (or a legacy player id) is expected.
 */
export const controllerIdSchema = opaqueId.brand<'ControllerId'>();
export type ControllerId = z.infer<typeof controllerIdSchema>;

/** One launch of one game: an EPOCH. Every game-scoped message names it; one for an ended launch is stale. */
export const gameSessionIdSchema = opaqueId.brand<'GameSessionId'>();
export type GameSessionId = z.infer<typeof gameSessionIdSchema>;
