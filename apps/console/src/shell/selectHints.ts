import type { CharacterSelectView } from './model';

/**
 * First-time help on character select (owner, 2026-11-14: "brief, helpful, not annoying"). One hint at a time, and each is
 * gone for good on this TV once somebody has done what it shows:
 * - pick: a person is choosing: the stick moves their cursor, SELECT readies them.
 * - bots: everyone is READY and there are no bots: › on the bar adds one.
 * - botPick: a person is choosing a bot's character: the stick moves the bot's cursor, SELECT readies it, BACK removes it.
 * Pure: the screen feeds it the view; storage is passed in.
 */
export type SelectHintId = 'pick' | 'bots' | 'botPick';

const IDS: readonly SelectHintId[] = ['pick', 'bots', 'botPick'];
const KEY = 'foomerang.selectHints';

const choosingBot = (view: CharacterSelectView) => view.seats.find((s) => s.chooser !== undefined);

/** The hint to show now, if any. */
export function selectHint(
  view: CharacterSelectView,
  learned: ReadonlySet<SelectHintId>,
): SelectHintId | undefined {
  if ((view.setup?.stage ?? 'CHARACTERS') !== 'CHARACTERS') return undefined;
  if (choosingBot(view) !== undefined) return learned.has('botPick') ? undefined : 'botPick';
  const people = view.seats.filter((s) => s.kind === 'phone');
  if (people.some((s) => !s.ready)) return learned.has('pick') ? undefined : 'pick';
  if (people.length > 0 && view.everyoneReady && view.bots === 0 && view.canAddBot)
    return learned.has('bots') ? undefined : 'bots';
  return undefined;
}

/** What somebody just did, between two views, that a hint shows how to do. */
export function hintsLearned(
  before: CharacterSelectView,
  after: CharacterSelectView,
): SelectHintId[] {
  const learned: SelectHintId[] = [];
  const readyPeople = (v: CharacterSelectView) =>
    v.seats.filter((s) => s.kind === 'phone' && s.ready).map((s) => s.slot);
  const was = new Set(readyPeople(before));
  if (readyPeople(after).some((slot) => !was.has(slot))) learned.push('pick');
  if (after.bots > before.bots) learned.push('bots');
  const chosen = choosingBot(before);
  if (chosen !== undefined) {
    const now = after.seats.find((s) => s.slot === chosen.slot);
    if (now !== undefined && now.id === chosen.id && now.ready) learned.push('botPick');
  }
  return learned;
}

export function loadLearnedHints(storage: Storage | undefined): Set<SelectHintId> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? IDS.filter((id) => parsed.includes(id)) : []);
  } catch {
    return new Set();
  }
}

export function saveLearnedHints(
  learned: ReadonlySet<SelectHintId>,
  storage: Storage | undefined,
): void {
  try {
    storage?.setItem(KEY, JSON.stringify([...learned]));
  } catch {
    // blocked site data: the hints are learned for this visit only
  }
}
