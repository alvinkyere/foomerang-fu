export type CharacterKind = 'BREAD' | 'COFFEE' | 'PUMPKIN' | 'FRUIT';
export const CHARACTERS: readonly CharacterKind[] = ['BREAD', 'COFFEE', 'PUMPKIN', 'FRUIT'];
/** Seats 1–4 are the four characters; seats 5 and 6 repeat Bread and Coffee (their colour ring tells them apart). */
export const characterForNumber = (number: number): CharacterKind =>
  CHARACTERS[Math.max(0, number - 1) % CHARACTERS.length] as CharacterKind;
