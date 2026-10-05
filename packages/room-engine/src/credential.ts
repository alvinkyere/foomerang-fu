declare const kind: unique symbol;

const REDACTED = '[REDACTED]';
const NODE_INSPECT = Symbol.for('nodejs.util.inspect.custom');

/**
 * A secret that proves identity (reconnecting a player, reclaiming a room as host).
 *
 * Security rule: credentials must not appear in routine logs, analytics, error messages or
 * consumer-facing state. This type makes the safe path the default: every implicit string
 * representation is redacted, and the value leaves only through the explicit, greppable
 * `reveal()` — called at exactly the sites that must deliver the credential to its owner.
 */
export class Credential<TKind extends string> {
  /** Phantom member: makes different kinds of credential incompatible. */
  declare readonly [kind]: TKind;

  readonly #value: string;

  constructor(value: string) {
    if (value.length === 0) throw new Error('A credential must not be empty');
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  /**
   * Compares in time independent of where the first difference is. The loop runs over the
   * secret's own length; a length mismatch is folded into the result rather than returning early.
   */
  equals(candidate: string): boolean {
    const secret = this.#value;
    let difference = secret.length ^ candidate.length;
    for (let i = 0; i < secret.length; i += 1) {
      difference |= secret.charCodeAt(i) ^ candidate.charCodeAt(i);
    }
    return difference === 0;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [NODE_INSPECT](): string {
    return REDACTED;
  }
}

export type ReconnectToken = Credential<'ReconnectToken'>;
export type HostToken = Credential<'HostToken'>;

export const toReconnectToken = (value: string): ReconnectToken => new Credential(value);
export const toHostToken = (value: string): HostToken => new Credential(value);
