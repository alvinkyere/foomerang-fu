import type { HostFailure } from '../../host';
import { noticeCopy } from '../../ui/copy';
import type { ShellFailure } from '../model';

/** What a person is told. Plain words: never an address, a code, or the name of a technology. */
export function failureView(failure: HostFailure, phase: 'IDLE' | 'ENDED'): ShellFailure {
  const opening = phase === 'IDLE';
  const title = opening ? 'Couldn’t open a room' : 'This room has closed';
  switch (failure.kind) {
    case 'CONNECTION_FAILED':
      return {
        title,
        message:
          'Foomerang couldn’t reach the game. Make sure this screen is online and the game is running, then try again.',
      };
    case 'CONNECTION_LOST':
      return {
        title,
        message: 'The connection was lost and could not be restored, so the room has closed.',
      };
    case 'SERVER':
      return { title, message: noticeCopy(failure.code) };
  }
}

/**
 * Configuration problems, said to a person. The configuration's own wording (variable names, URLs) is
 * for developers and goes to the browser console only; nothing here repeats it.
 */
export interface AddressAdvice {
  /** One short sentence for the Join screen. */
  readonly bar: string;
  /** What to do, for Settings › Network. */
  readonly note: string;
}

export function addressAdvice(warning: string): AddressAdvice {
  if (/localhost|loopback|points at this computer/i.test(warning)) {
    return {
      bar: 'Phones can’t reach this screen yet: it is open as “localhost”.',
      note:
        'Phones can’t join because this screen is open as “localhost”, which only this computer understands. ' +
        'Open Foomerang using this computer’s Wi-Fi address instead (it looks like 192.168.x.x), then open a new room. ' +
        'If you’re not sure how, ask whoever set this up.',
    };
  }
  return {
    bar: 'Phones may not be able to join this screen.',
    note: 'Phones may not be able to join. Check that this screen and the phones are on the same Wi-Fi, then open a new room.',
  };
}
