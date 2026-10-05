/**
 * Expected domain outcomes are values, not exceptions. Exceptions are reserved for programming
 * or system faults. The server translates `reason`s into protocol error codes.
 */
export type Result<TValue, TReason extends string> =
  { readonly ok: true; readonly value: TValue } | { readonly ok: false; readonly reason: TReason };

export const ok = <TValue>(value: TValue): { readonly ok: true; readonly value: TValue } => ({
  ok: true,
  value,
});

export const fail = <TReason extends string>(
  reason: TReason,
): { readonly ok: false; readonly reason: TReason } => ({ ok: false, reason });
