// Public API of @foomerang/server. Socket.IO stays behind the transport boundary: nothing exported
// here exposes a Socket.IO type.

export { createFoomerangServer } from './server';
export type { FoomerangServer, ServerOptions } from './server';

export { createNodeEnvironment } from './environment';

export { DEFAULT_RATE_LIMITS } from './rateLimit';
export type { BucketConfig, RateLimits } from './rateLimit';

export type { GameDefinition } from './application';
export type { DiagnosticsSnapshot } from './diagnostics';
export type { CancelFn, Scheduler } from './scheduler';
export { realScheduler } from './scheduler';
export type { ServerTransport, TransportConnection } from './transport';
