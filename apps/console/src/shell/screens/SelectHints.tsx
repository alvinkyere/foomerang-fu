import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CharacterSelectView } from '../model';
import {
  hintsLearned,
  loadLearnedHints,
  saveLearnedHints,
  selectHint,
  type SelectHintId,
} from '../selectHints';
import './selectHints.css';

/** The phone's own words for its buttons, in the select screen's green and coral (as its READY? prompt draws them). */
const SelectGlyph = () => <kbd className="cs__glyph cs__glyph--select">SELECT</kbd>;
const BackGlyph = () => <kbd className="cs__glyph cs__glyph--back">BACK</kbd>;

/** The stick's ‹ › nudging side to side: "move it this way". */
const Nudge = () => (
  <span className="cs__nudge" aria-hidden="true">
    <span>‹</span>
    <span>›</span>
  </span>
);

const hintStorage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/** A first-time hint shows only once it has been the one to show for this long: whoever knows what to do never sees it. */
const HINT_DELAY_MS = 1500;

/** The hint to show now (selectHints.ts), after its delay; each is learned for good on this TV once somebody does it. */
function useSelectHint(select: CharacterSelectView): SelectHintId | undefined {
  const [learned, setLearned] = useState(() => loadLearnedHints(hintStorage()));
  const before = useRef(select);
  useEffect(() => {
    const got = hintsLearned(before.current, select).filter((id) => !learned.has(id));
    before.current = select;
    if (got.length === 0) return;
    const next = new Set([...learned, ...got]);
    saveLearnedHints(next, hintStorage());
    setLearned(next);
  }, [select, learned]);
  const hint = selectHint(select, learned);
  const [shown, setShown] = useState<SelectHintId | undefined>(undefined);
  useEffect(() => {
    if (hint === undefined) return;
    const timer = window.setTimeout(() => setShown(hint), HINT_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      setShown(undefined);
    };
  }, [hint]);
  return shown === hint ? shown : undefined;
}

/**
 * Character select's first-time hints (owner, 2026-11-14: brief, helpful, never in the way): one quiet line at a time, in
 * the free band under CHOOSE CHARACTERS (or under the bar's bots): how to choose and get READY, that › on the bar adds bots,
 * and how to choose a bot's character.
 */
export function SelectHints({ select }: { readonly select: CharacterSelectView }) {
  const hint = useSelectHint(select);
  if (hint === 'pick')
    return (
      <p className="cs__hint" role="status" data-testid="select-hint">
        <Nudge /> CHOOSE <SelectGlyph /> READY
      </p>
    );
  if (hint === 'bots')
    return (
      <p className="cs__hint cs__hint--bots" role="status" data-testid="select-hint">
        PUSH
        <span className="cs__point" aria-hidden="true">
          ›
        </span>
        TO ADD BOTS
      </p>
    );
  const chosen = select.seats.find((seat) => seat.chooser !== undefined);
  if (hint !== 'botPick' || chosen === undefined) return null;
  const colour = select.seats.find((seat) => seat.number === chosen.chooser)?.character?.color;
  return (
    <p className="cs__hint" role="status" data-testid="select-hint">
      <span className="cs__badge cs__badge--hint" style={{ '--badge': colour } as CSSProperties}>
        P{chosen.chooser}
      </span>
      <Nudge /> CHOOSE {chosen.name ?? 'THE BOT'}’S CHARACTER <SelectGlyph /> READY <BackGlyph />{' '}
      REMOVE
    </p>
  );
}
