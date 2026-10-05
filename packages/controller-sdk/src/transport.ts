/**
 * How a controller talks to the server. The UI and the session know ONLY this interface:
 * Socket.IO lives behind it (SocketIOTransport), and a native app can later provide a
 * NativeControllerTransport without Foomerang Fu or the UI caring.
 *
 * One transport object is ONE connection. A reconnect is a brand-new transport from the factory
 * (a new epoch), which keeps stale events from an old connection from leaking into a new one.
 */
export interface ControllerTransport {
  /** Opens the connection. Rejects if it cannot be established. */
  connect(): Promise<void>;
  send(message: unknown): void;
  close(): void;
  onMessage(handler: (raw: unknown) => void): void;
  /** Fires when an established connection ends, whoever ended it. May fire late or more than once. */
  onClose(handler: () => void): void;
}

export type ControllerTransportFactory = () => ControllerTransport;
