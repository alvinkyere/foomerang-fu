import { joinCodeSchema, type JoinCode } from '@foomerang/protocol';
import type { SessionFailure } from '@foomerang/controller-sdk';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { failureMessage } from '../copy';

export interface JoinScreenProps {
  /** From the QR link. When present the player only has to type a name. */
  readonly initialRoom?: string | undefined;
  readonly busy: boolean;
  readonly failure?: SessionFailure | undefined;
  readonly onJoin: (joinCode: JoinCode, displayName: string) => void;
}

type FieldError = { readonly field: 'room' | 'name'; readonly message: string };

/** No accounts, no sign-up, no email: a room code and a name. Scan → name → play. */
export function JoinScreen({ initialRoom, busy, failure, onJoin }: JoinScreenProps) {
  const [room, setRoom] = useState(initialRoom ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<FieldError | undefined>(undefined);
  const roomRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Start where the player has work to do: the name if the QR link supplied the room.
  useEffect(() => {
    (initialRoom === undefined ? roomRef : nameRef).current?.focus();
  }, [initialRoom]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (busy) return;
    const code = joinCodeSchema.safeParse(room);
    if (!code.success) {
      setError({ field: 'room', message: 'Enter the 6-character room code shown on the screen.' });
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError({ field: 'name', message: 'Enter a name so your friends know who you are.' });
      return;
    }
    setError(undefined);
    onJoin(code.data, trimmed);
  };

  const message = error?.message ?? (failure ? failureMessage(failure) : undefined);

  return (
    <main className="screen join-screen">
      <h1 className="wordmark">Foomerang</h1>
      <form className="join-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Room code</span>
          <input
            ref={roomRef}
            className="field-input code-input"
            value={room}
            disabled={busy}
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            aria-invalid={error?.field === 'room'}
            aria-describedby={message ? 'join-message' : undefined}
            onChange={(event) => {
              setRoom(event.target.value.replace(/\s+/g, '').toUpperCase());
              setError(undefined);
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Your name</span>
          <input
            ref={nameRef}
            className="field-input"
            value={name}
            disabled={busy}
            maxLength={16}
            autoComplete="nickname"
            enterKeyHint="go"
            aria-invalid={error?.field === 'name'}
            aria-describedby={message ? 'join-message' : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
        </label>
        {message ? (
          <p id="join-message" className="message message-error" role="alert">
            {message}
          </p>
        ) : null}
        {busy ? (
          <p className="message" role="status">
            Joining…
          </p>
        ) : null}
        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>
    </main>
  );
}
