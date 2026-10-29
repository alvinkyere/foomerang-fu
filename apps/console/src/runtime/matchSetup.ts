import { GAME_MODES, isStartableMode, type GameModeId } from './gameMode';

/**
 * What happens between "everyone is READY on a character" and the first round, as the reference video shows it
 * (game-setting.mp4; ff physics hq 2.mp4 9:38-9:50): GAME MODE (three cards), for Team Up PICK TEAMS (a red and a blue banner,
 * each person moves their own tile into one), then READY? (MODIFIERS, FIGHT!). Pure: the host feeds it who is playing and each
 * phone's menu actions; nothing here knows about screens or the network.
 */
export type SetupStage = 'CHARACTERS' | 'MODE' | 'TEAMS' | 'READY';
export type Side = 'RED' | 'BLUE';
export const SIDE_INDEX: Readonly<Record<Side, 0 | 1>> = Object.freeze({ RED: 0, BLUE: 1 });

export interface SetupParticipant {
  readonly id: string;
  readonly cpu: boolean;
}

/** What a SELECT did here: moved on, was refused (the mode is not built / the teams are not valid yet), began the match, or nothing. */
export type SetupResult = 'ADVANCED' | 'REFUSED' | 'BEGIN' | 'NONE';

export class MatchSetup {
  #stage: SetupStage = 'CHARACTERS';
  #hover = 0;
  /** Who stands where on PICK TEAMS: absent = still in the middle. */
  readonly #sides = new Map<string, Side>();
  #participants: readonly SetupParticipant[] = [];
  #mode: GameModeId = 'FREE_FOR_ALL';
  #version = 0;
  readonly #listeners = new Set<() => void>();

  get stage(): SetupStage {
    return this.#stage;
  }
  get hover(): number {
    return this.#hover;
  }
  get mode(): GameModeId {
    return this.#mode;
  }
  get version(): number {
    return this.#version;
  }
  /** Every participant's side (in the middle: undefined). */
  sideOf(id: string): Side | undefined {
    return this.#sides.get(id);
  }

  /** The TV's pointer on a GAME MODE card. */
  hoverTo(index: number): void {
    if (this.#stage !== 'MODE' || index === this.#hover || index < 0 || index > 2) return;
    this.#hover = index;
    this.#emit();
  }

  sync(participants: readonly SetupParticipant[]): void {
    this.#participants = participants;
    const present = new Set(participants.map((p) => p.id));
    for (const id of [...this.#sides.keys()]) if (!present.has(id)) this.#sides.delete(id);
  }

  /** Everyone is READY on a character: the GAME MODE screen. */
  enter(mode: GameModeId): void {
    this.#mode = mode;
    this.#hover = Math.max(
      0,
      GAME_MODES.findIndex((m) => m.id === mode),
    );
    this.#stage = 'MODE';
    this.#emit();
  }

  /** A fresh lobby (or a match ended): back to choosing characters. */
  reset(): void {
    if (this.#stage === 'CHARACTERS' && this.#sides.size === 0) return;
    this.#stage = 'CHARACTERS';
    this.#sides.clear();
    this.#emit();
  }

  move(id: string, direction: 'left' | 'right'): void {
    if (this.#stage === 'MODE') {
      const cards = GAME_MODES.slice(0, 3); // (Hide & Seek is not on the screen)
      const next = Math.max(
        0,
        Math.min(cards.length - 1, this.#hover + (direction === 'left' ? -1 : 1)),
      );
      if (next !== this.#hover) {
        this.#hover = next;
        this.#emit();
      }
    } else if (this.#stage === 'TEAMS') {
      const p = this.#participants.find((x) => x.id === id);
      if (p === undefined || p.cpu) return;
      const now = this.#sides.get(id);
      // the middle → a banner; a banner → back to the middle
      const next: Side | undefined =
        direction === 'left'
          ? now === 'BLUE'
            ? undefined
            : 'RED'
          : now === 'RED'
            ? undefined
            : 'BLUE';
      if (next === now) return;
      if (next === undefined) this.#sides.delete(id);
      else this.#sides.set(id, next);
      this.#fillBots();
      this.#emit();
    }
  }

  /** CPUs never choose: they stand on whichever side has fewer, in order, once the people have gone to a banner. */
  #fillBots(): void {
    for (const p of this.#participants) if (p.cpu) this.#sides.delete(p.id);
    const count = (s: Side): number => [...this.#sides.values()].filter((x) => x === s).length;
    for (const p of this.#participants) {
      if (!p.cpu) continue;
      this.#sides.set(p.id, count('RED') <= count('BLUE') ? 'RED' : 'BLUE');
    }
  }

  /** Every person is on a banner, and both banners have someone. */
  get teamsValid(): boolean {
    const people = this.#participants.filter((p) => !p.cpu);
    if (people.some((p) => !this.#sides.has(p.id))) return false;
    const sides = new Set(this.#sides.values());
    return sides.has('RED') && sides.has('BLUE');
  }

  select(): SetupResult {
    switch (this.#stage) {
      case 'MODE': {
        const card = GAME_MODES[this.#hover];
        if (card === undefined || !isStartableMode(card.id)) return 'REFUSED';
        this.#mode = card.id;
        this.#stage = card.id === 'TEAM_UP' ? 'TEAMS' : 'READY';
        if (card.id === 'TEAM_UP') {
          this.#sides.clear();
          this.#fillBots();
        }
        this.#emit();
        return 'ADVANCED';
      }
      case 'TEAMS':
        if (!this.teamsValid) return 'REFUSED';
        this.#stage = 'READY';
        this.#emit();
        return 'ADVANCED';
      case 'READY':
        return 'BEGIN';
      default:
        return 'NONE';
    }
  }

  /** BACK: a step back (a person on a banner first steps off it). Returns false at the first stage: nothing to go back to here. */
  back(id: string): boolean {
    switch (this.#stage) {
      case 'READY':
        this.#stage = this.#mode === 'TEAM_UP' ? 'TEAMS' : 'MODE';
        break;
      case 'TEAMS':
        if (this.#sides.has(id) && !(this.#participants.find((p) => p.id === id)?.cpu ?? true)) {
          this.#sides.delete(id);
          this.#fillBots();
        } else this.#stage = 'MODE';
        break;
      case 'MODE':
        this.#stage = 'CHARACTERS';
        break;
      default:
        return false;
    }
    this.#emit();
    return true;
  }

  /** The sides, as the rules take them (everyone in the middle counts as red). */
  sides(): ReadonlyMap<string, 0 | 1> {
    return new Map(
      this.#participants.map((p) => [p.id, SIDE_INDEX[this.#sides.get(p.id) ?? 'RED']] as const),
    );
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(): void {
    this.#version += 1;
    for (const l of [...this.#listeners]) l();
  }
}
