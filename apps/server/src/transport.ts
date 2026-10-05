/**
 * The transport boundary: HOW messages travel. Nothing here knows about sessions, rooms or
 * identity, and nothing outside `socketio/` knows about Socket.IO. A WebRTC or raw-WebSocket
 * transport would implement these two interfaces and change nothing else.
 *
 * Payloads are `unknown` on the way IN. They stay unknown until the protocol parser accepts them.
 */
export interface TransportConnection {
  /** Transport-level identifier. Diagnostic only — it is NEVER an identity. */
  readonly id: string;
  send(message: unknown): void;
  /** Server-initiated close. */
  close(): void;
  onMessage(handler: (raw: unknown) => void): void;
  /** Fires once when the connection ends, whoever ended it. May fire late. */
  onClose(handler: () => void): void;
}

export interface ServerTransport {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
  onConnection(handler: (connection: TransportConnection) => void): void;
}
