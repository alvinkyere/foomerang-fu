import type { SessionFailure } from '@foomerang/controller-sdk';
import { useEffect, useRef } from 'react';
import { failureMessage } from '../copy';

/** The controller cannot continue (seat released, replaced by another device, connection lost). */
export function EndedScreen({
  failure,
  onRestart,
}: {
  readonly failure: SessionFailure | undefined;
  readonly onRestart: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => buttonRef.current?.focus(), []);
  return (
    <main className="screen ended-screen">
      <h1 className="wordmark">Foomerang</h1>
      <p className="message message-error" role="alert">
        {failure ? failureMessage(failure) : 'The game has ended.'}
      </p>
      <button ref={buttonRef} className="button" type="button" onClick={onRestart}>
        Join again
      </button>
    </main>
  );
}
