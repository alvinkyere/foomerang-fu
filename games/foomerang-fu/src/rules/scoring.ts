/**
 * The kill-race score (Slice 8), as a pure function. The RULES decide who is credited for a death (see step.ts and
 * the attribution table in docs/FOOMERANG_FU.md); this module only turns the deaths of one simulation step into
 * changes of the holes in each player's meter. Nothing here knows about Phaser or the UI.
 *
 *   enemy kill     the credited player +1
 *   self-kill      the victim −1 (never below 0); nobody else is credited
 *   environment    the victim −1 (never below 0); nobody is credited
 */

/** What killed the player, as the rules resolved it. */
export type DeathCause = 'SLASH' | 'BOOMERANG' | 'BLAST' | 'HAZARD' | 'OUT_OF_BOUNDS' | 'FALL' | 'CRUSH';

export interface Death {
  readonly victimId: string;
  /** Who gets the kill; undefined when nobody does (the arena). The victim themself is a self-kill. */
  readonly creditedTo: string | undefined;
  readonly cause: DeathCause;
}

export type ScoreReason = 'KILL' | 'SELF_KILL' | 'ENVIRONMENT';

export interface ScoreChange {
  /** Whose meter changed. */
  readonly playerId: string;
  readonly victimId: string;
  /** +1, −1, or 0 (a penalty at an empty meter). */
  readonly delta: number;
  readonly reason: ScoreReason;
  /** Their kill count after this change (running, in death order). */
  readonly kills: number;
}

export interface ScoreResult {
  readonly scores: Readonly<Record<string, number>>;
  readonly changes: readonly ScoreChange[];
  /** Everyone who gained a kill on this step, in the order they first did. */
  readonly gained: readonly string[];
}

export function applyDeaths(
  scores: Readonly<Record<string, number>>,
  deaths: readonly Death[],
): ScoreResult {
  const next: Record<string, number> = { ...scores };
  const changes: ScoreChange[] = [];
  const gained: string[] = [];
  for (const death of deaths) {
    const { victimId, creditedTo } = death;
    if (creditedTo !== undefined && creditedTo !== victimId) {
      next[creditedTo] = (next[creditedTo] ?? 0) + 1;
      changes.push({
        playerId: creditedTo,
        victimId,
        delta: 1,
        reason: 'KILL',
        kills: next[creditedTo],
      });
      if (!gained.includes(creditedTo)) gained.push(creditedTo);
    } else {
      const before = next[victimId] ?? 0;
      next[victimId] = Math.max(0, before - 1);
      changes.push({
        playerId: victimId,
        victimId,
        delta: next[victimId] - before,
        reason: creditedTo === victimId ? 'SELF_KILL' : 'ENVIRONMENT',
        kills: next[victimId],
      });
    }
  }
  return { scores: Object.freeze(next), changes, gained };
}

/**
 * Who has won on this step: only players who GAINED a kill on it and now have a full meter. (Holding a full meter is
 * not enough: in a tiebreak everyone starts full.) One name: the match is over at once. More than one: they filled
 * the last hole on the same simulation step, which is a tie, never a matter of array order.
 */
export const fullMeters = (
  scores: Readonly<Record<string, number>>,
  gained: readonly string[],
  target: number,
): readonly string[] => gained.filter((id) => (scores[id] ?? 0) >= target);

/** TEAM UP: every team's kills together (a kill by any member fills the team's meter). */
export const teamTotals = (
  scores: Readonly<Record<string, number>>,
  teams: Readonly<Record<string, number>>,
): ReadonlyMap<number, number> => {
  const totals = new Map<number, number>();
  for (const [id, team] of Object.entries(teams))
    totals.set(team, (totals.get(team) ?? 0) + (scores[id] ?? 0));
  return totals;
};

/**
 * TEAM UP: who holds a full meter. One team only: its top scorer stands for it (`ids` has one name: the match is won, and
 * `team` says which side). Several teams (they filled it on the same step): everyone on them, which is a tie.
 * `among` limits it to those who gained a kill on this step (as `fullMeters`); omitted, to everyone on a full team.
 */
export const fullTeams = (
  scores: Readonly<Record<string, number>>,
  teams: Readonly<Record<string, number>>,
  target: number,
  among?: readonly string[],
): { readonly ids: readonly string[]; readonly team: number | undefined } => {
  const totals = teamTotals(scores, teams);
  const pool = (among ?? Object.keys(teams)).filter(
    (id) => (totals.get(teams[id] as number) ?? 0) >= target,
  );
  const sides = new Set(pool.map((id) => teams[id] as number));
  if (sides.size !== 1) return { ids: pool, team: undefined };
  const best = [...pool].sort((x, y) => (scores[y] ?? 0) - (scores[x] ?? 0))[0] as string;
  return { ids: [best], team: [...sides][0] };
};
