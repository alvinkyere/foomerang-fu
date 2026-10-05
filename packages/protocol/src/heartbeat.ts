import { z } from 'zod';
import { seqSchema } from './envelope';

/**
 * Session-layer liveness, independent of Socket.IO's own ping. Lets us distinguish "hasn't moved
 * the stick" from "disappeared from the network". The ack echoes `seq`, which also yields RTT.
 */
export const heartbeatMessageSchema = z.strictObject({
  type: z.literal('HEARTBEAT'),
  seq: seqSchema,
});
export type HeartbeatMessage = z.infer<typeof heartbeatMessageSchema>;

export const heartbeatAckMessageSchema = z.strictObject({
  type: z.literal('HEARTBEAT_ACK'),
  seq: seqSchema,
});
export type HeartbeatAckMessage = z.infer<typeof heartbeatAckMessageSchema>;
