/**
 * Primitive-arena visual identity. Colour is NEVER the only cue: every slot also has a number and
 * a shape (and the player's name is always drawn). Colours are the Okabe–Ito set, chosen to stay
 * distinguishable under common colour-vision deficiencies.
 */
export interface SlotStyle {
  readonly color: string;
  readonly number: number;
  readonly shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'cross';
  readonly marker: string;
}

export const SLOT_STYLES: readonly SlotStyle[] = [
  { color: '#E69F00', number: 1, shape: 'circle', marker: '●' },
  { color: '#56B4E9', number: 2, shape: 'square', marker: '■' },
  { color: '#009E73', number: 3, shape: 'triangle', marker: '▲' },
  { color: '#F0E442', number: 4, shape: 'diamond', marker: '◆' },
  { color: '#CC79A7', number: 5, shape: 'star', marker: '★' },
  { color: '#D55E00', number: 6, shape: 'cross', marker: '✚' },
];

export interface SeatedPlayer {
  readonly playerId: string;
  /** Does the player still hold a seat? (A released seat gives up its slot.) */
  readonly seated: boolean;
}

/**
 * Stable slot assignment, at the INTEGRATION layer (room-engine has no seat numbers and does not
 * need them). A player keeps the same slot — and therefore the same colour, number and spawn
 * point — through reconnects and roster reordering, so "that's MY circle" always holds. A slot is
 * freed only when the player's seat is released.
 */
export class SlotAllocator {
  readonly #slotByPlayer = new Map<string, number>();

  sync(players: readonly SeatedPlayer[]): void {
    const listed = new Set(players.filter((p) => p.seated).map((p) => p.playerId));
    for (const id of [...this.#slotByPlayer.keys()]) {
      if (!listed.has(id)) this.#slotByPlayer.delete(id); // released, or gone altogether (a removed CPU)
    }
    const used = new Set(this.#slotByPlayer.values());
    for (const player of players) {
      if (!player.seated || this.#slotByPlayer.has(player.playerId)) continue;
      for (let slot = 0; slot < SLOT_STYLES.length; slot += 1) {
        if (!used.has(slot)) {
          this.#slotByPlayer.set(player.playerId, slot);
          used.add(slot);
          break;
        }
      }
    }
  }

  slotOf(playerId: string): number | undefined {
    return this.#slotByPlayer.get(playerId);
  }
}
