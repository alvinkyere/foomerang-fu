import type { ReactNode } from 'react';

/**
 * The four plush characters as small flat badges for the shell (the game draws its own, painted).
 * Which one a player gets is cosmetic and follows their seat, exactly as in the game.
 */
export type CharacterId = 'bread' | 'coffee' | 'orange' | 'fruit';

export const CHARACTER_BY_SEAT: readonly CharacterId[] = [
  'bread',
  'coffee',
  'orange',
  'fruit',
  'bread',
  'coffee',
];
export const CHARACTER_NAME: Readonly<Record<CharacterId, string>> = {
  bread: 'Bread Slice',
  coffee: 'Coffee Cup',
  orange: 'Orange',
  fruit: 'Green Fruit',
};

const Face = ({ y = 36 }: { y?: number }) => (
  <>
    <ellipse cx="25" cy={y} rx="3.2" ry="4" fill="#2a1a12" />
    <ellipse cx="39" cy={y} rx="3.2" ry="4" fill="#2a1a12" />
    <circle cx="26" cy={y - 1.5} r="1.1" fill="#fff" />
    <circle cx="40" cy={y - 1.5} r="1.1" fill="#fff" />
    <ellipse cx="19" cy={y + 6} rx="4" ry="2.4" fill="#ff8a8a" opacity="0.55" />
    <ellipse cx="45" cy={y + 6} rx="4" ry="2.4" fill="#ff8a8a" opacity="0.55" />
    <path
      d={`M29 ${y + 5}q3 3.200 6 0`}
      fill="none"
      stroke="#2a1a12"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </>
);

const BODIES: Readonly<Record<CharacterId, ReactNode>> = {
  bread: (
    <>
      <path
        d="M14 22c-6-1-8-9-2-12 4-3 8 0 10-3 4-3 16-3 20 0 2 3 6 0 10 3 6 3 4 11-2 12v22c0 5-3 8-8 8H22c-5 0-8-3-8-8Z"
        fill="#c98a4b"
      />
      <path
        d="M17 24c-5-1-6-7-1-9 3-2 7 0 8-2 3-2 13-2 16 0 1 2 5 0 8 2 5 2 4 8-1 9v20c0 3-2 5-5 5H22c-3 0-5-2-5-5Z"
        fill="#f6dba6"
      />
      <Face y={37} />
    </>
  ),
  coffee: (
    <>
      <path
        d="M48 28h4c6 0 8 4 8 8s-2 8-8 8h-5"
        fill="none"
        stroke="#e8eef0"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M10 22h40v22c0 8-6 14-14 14H24c-8 0-14-6-14-14Z" fill="#f6fbfc" />
      <ellipse cx="30" cy="22" rx="20" ry="6.500" fill="#e1eaed" />
      <ellipse cx="30" cy="22.500" rx="16.500" ry="4.500" fill="#6b3f26" />
      <path
        d="M12 34c0 14 6 20 16 20"
        fill="none"
        stroke="#dbe6ea"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g transform="translate(-2 4) scale(.95)">
        <Face y={38} />
      </g>
    </>
  ),
  orange: (
    <>
      <circle cx="32" cy="36" r="23" fill="#ff9a1f" />
      <path d="M32 13c-2-5 1-8 6-9 0 4-2 8-6 9Z" fill="#6fcf4a" />
      <path d="M32 13v4" stroke="#6b4a1a" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M17 28a17 17 0 0 1 10-10"
        fill="none"
        stroke="#ffd18a"
        strokeWidth="3.500"
        strokeLinecap="round"
        opacity=".8"
      />
      <Face y={38} />
    </>
  ),
  fruit: (
    <>
      <path d="M32 54C18 54 9 46 9 35S17 14 32 14s23 10 23 21-9 19-23 19Z" fill="#8fd35a" />
      <path d="M32 14c0-6 3-9 8-10-1 5-3 8-8 10Z" fill="#4fa83a" />
      <path d="M32 14c0-5-3-8-8-8 0 5 3 7 8 8Z" fill="#6ec24a" />
      <path
        d="M16 28a17 15 0 0 1 9-8"
        fill="none"
        stroke="#d1f2a8"
        strokeWidth="3.500"
        strokeLinecap="round"
        opacity=".85"
      />
      <Face y={37} />
    </>
  ),
};

export function Character({
  id,
  className,
}: {
  readonly id: CharacterId;
  readonly className?: string;
}) {
  return (
    <svg
      className={className === undefined ? 'character' : `character ${className}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      {BODIES[id]}
    </svg>
  );
}
