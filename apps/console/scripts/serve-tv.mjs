// The console for a TV's browser (`pnpm dev:demo` starts it next to the dev server): a production build in dist-tv/,
// rebuilt whenever the code changes, served on :5175. Reload the TV after a change.
import { build, preview } from 'vite';

const outDir = 'dist-tv';
const PORT = 5175;

await build({ build: { outDir } }); // the first build must exist before anything is served
const server = await preview({ build: { outDir }, preview: { port: PORT, strictPort: true } });
server.printUrls();
const watcher = await build({ logLevel: 'warn', build: { outDir, watch: {} } });
watcher.on('event', (event) => {
  if (event.code === 'BUNDLE_END') console.log('TV build updated: reload the TV to see it.');
  if (event.code === 'ERROR') console.log('TV build failed: see the error above.');
});
