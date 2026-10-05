// A stand-in for the TV/console until Slice 8, so the controller can be tried on a real phone:
//
//   1.  pnpm --filter @foomerang/server start         (the server, :3001)
//   2.  pnpm --filter @foomerang/controller dev       (the controller, :5173)
//   3.  pnpm --filter @foomerang/controller dev:host  (this: creates a room, prints join links)
//
// It creates a room, prints a link per network address, and logs the roster and each player's
// input. It is a development tool, not the product's console.
import { networkInterfaces } from 'node:os';
import { SocketIOTransport } from '@foomerang/controller-sdk';
import { PROTOCOL_VERSION, parseServerMessage } from '@foomerang/protocol';

const serverUrl = process.env['SERVER_URL'] ?? 'http://localhost:3001';
const controllerPort = Number(process.env['CONTROLLER_PORT'] ?? 5173);

const transport = new SocketIOTransport(serverUrl);
const names = new Map<string, string>();
let lastLine = '';

const lanAddresses = (): string[] =>
  Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);

transport.onMessage((raw) => {
  const parsed = parseServerMessage(raw);
  if (!parsed.ok) return;
  const message = parsed.message;
  switch (message.type) {
    case 'HANDSHAKE_ACCEPTED':
      transport.send({ type: 'ROOM_CREATE', payload: { gameId: 'foomerang-fu' } });
      return;
    case 'ROOM_CREATED': {
      const { joinCode } = message.payload;
      console.log(`\nRoom ${joinCode} is open. Join from a phone on the same Wi-Fi:\n`);
      for (const address of [...lanAddresses(), 'localhost']) {
        console.log(`   http://${address}:${controllerPort}/?room=${joinCode}`);
      }
      console.log('\n(Ctrl-C to close.)\n');
      return;
    }
    case 'ROOM_UPDATED':
      for (const player of message.payload.players) names.set(player.playerId, player.displayName);
      console.log(
        `roster: ${message.payload.players.map((p) => `${p.displayName} [${p.connection}/${p.seat}]`).join(', ') || '(empty)'}`,
      );
      return;
    case 'PLAYER_INPUT': {
      const who = names.get(message.payload.playerId) ?? message.payload.playerId;
      const input = message.payload.input;
      const line =
        input.kind === 'MOVE'
          ? `${who}  move  x=${input.x.toFixed(2)}  y=${input.y.toFixed(2)}  (seq ${input.seq})`
          : `${who}  ${input.action} ${input.phase}`;
      if (line !== lastLine) console.log(line);
      lastLine = line;
      return;
    }
    case 'ERROR':
      console.error(`server error: ${message.payload.code}`);
      return;
    default:
      return;
  }
});

transport.onClose(() => {
  console.error('disconnected from the server');
  process.exit(1);
});

await transport.connect();
transport.send({
  type: 'HANDSHAKE',
  payload: { protocolVersion: PROTOCOL_VERSION, clientType: 'console', clientVersion: '0.1.0' },
});
process.once('SIGINT', () => {
  transport.close();
  process.exit(0);
});
