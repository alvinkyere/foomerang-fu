// Public API of @foomerang/controller-sdk: everything a controller UI (web today, native later)
// needs, and nothing about sockets. Socket.IO stays behind SocketIOTransport.

export { createControllerSession, ControllerSession } from './session';
export type {
  ControllerContextState,
  ControllerDiagnostics,
  ControllerPhase,
  ControllerSessionOptions,
  ControllerState,
  SessionFailure,
} from './session';

export type { ControllerTransport, ControllerTransportFactory } from './transport';
export { SocketIOTransport, createSocketIOTransportFactory } from './socketio/SocketIOTransport';

export { clampOrigin, joystickRadius, joystickVector } from './joystick';
export type { Point } from './joystick';

export { DEFAULT_SAMPLER_CONFIG, MovementSampler } from './sampler';
export type { SamplerConfig } from './sampler';

export { createStorageSessionStore } from './store';
export type { SessionStore, StoredSession } from './store';

export { browserEnvironment } from './environment';
export type { Cancel, Scheduler, SessionEnvironment } from './environment';
