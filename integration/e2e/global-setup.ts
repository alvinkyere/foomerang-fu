import { startStack } from './support/stack';

/** Starts the real stack once; the returned function is Playwright's teardown. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const stack = await startStack();
  process.env['FOOMERANG_E2E_STACK'] = JSON.stringify(stack.info);
  return async () => {
    await stack.stop();
  };
}
