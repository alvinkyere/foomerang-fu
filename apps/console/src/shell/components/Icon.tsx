import type { ReactNode } from 'react';

/**
 * The Foomerang icon family. One 32-unit grid, one 2.5 stroke, round caps and joins, and one
 * signature: every glyph carries a single solid "spark" dot, the way the boomerang carries its
 * return. Drawn for this product; nothing here traces another console's iconography.
 */
export type IconName =
  | 'players'
  | 'controllers'
  | 'settings'
  | 'help'
  | 'about'
  | 'phone'
  | 'cpu'
  | 'plus'
  | 'check'
  | 'close'
  | 'play'
  | 'book'
  | 'chevron-left'
  | 'chevron-right'
  | 'back'
  | 'warning'
  | 'display'
  | 'access'
  | 'network'
  | 'ready';

const GLYPHS: Readonly<Record<IconName, ReactNode>> = {
  players: (
    <>
      <circle cx="12" cy="12" r="4.6" />
      <path d="M3.8 26.5c0-5 3.7-8.2 8.2-8.2s8.2 3.2 8.2 8.2" />
      <path d="M21.2 8.2a4.2 4.2 0 0 1 0 7.8M24 19c2.7 1.1 4.2 3.5 4.2 6.5" />
      <circle cx="27" cy="6" r="1.7" className="spark" />
    </>
  ),
  controllers: (
    <>
      <rect x="3.5" y="9" width="25" height="15" rx="5" />
      <circle cx="10.5" cy="16.5" r="2.7" />
      <circle cx="21.5" cy="14.2" r="1.4" className="spark" />
      <circle cx="24.4" cy="18.6" r="1.4" className="spark" />
    </>
  ),
  settings: (
    <>
      <path d="M4.5 9h6M17.5 9h10M4.5 16h12M23.5 16h4M4.5 23h3M14.5 23h13" />
      <circle cx="14" cy="9" r="3" className="spark" />
      <circle cx="20" cy="16" r="3" className="spark" />
      <circle cx="11" cy="23" r="3" className="spark" />
    </>
  ),
  help: (
    <>
      <circle cx="16" cy="16" r="12.5" />
      <path d="M12.2 13c0-2.3 1.6-3.8 3.8-3.8s3.8 1.4 3.8 3.4c0 2.9-3.8 3-3.8 6" />
      <circle cx="16" cy="23" r="1.7" className="spark" />
    </>
  ),
  about: (
    <>
      <path d="M4.5 24.5C4.5 13 12 6 26.5 6.5c-4.7 3-6 7-5 14-3.8-3.5-9-3.7-17 4Z" />
      <circle cx="26.5" cy="25.5" r="1.9" className="spark" />
    </>
  ),
  phone: (
    <>
      <rect x="9" y="3.5" width="14" height="25" rx="4" />
      <path d="M14 7h4" />
      <circle cx="16" cy="24" r="1.5" className="spark" />
    </>
  ),
  cpu: (
    <>
      <rect x="7.5" y="7.5" width="17" height="17" rx="4.5" />
      <path d="M12 3.5v4M20 3.5v4M12 24.5v4M20 24.5v4M3.5 12h4M3.5 20h4M24.5 12h4M24.5 20h4" />
      <circle cx="16" cy="16" r="2.4" className="spark" />
    </>
  ),
  plus: <path d="M16 6.5v19M6.5 16h19" />,
  check: <path d="m6 17 6.5 6.5L26 9" />,
  close: <path d="m8 8 16 16M24 8 8 24" />,
  play: <path d="M10 6.5v19l16-9.5Z" className="solid" />,
  book: (
    <>
      <path d="M5 6.5c4.5-1.3 8.5-.8 11 1.6 2.5-2.4 6.5-2.9 11-1.6v18.2c-4.500-1.200-8.500-.7-11 1.800-2.500-2.500-6.500-3-11-1.800Z" />
      <path d="M16 8.1v18.400" />
    </>
  ),
  'chevron-left': <path d="m20 6-10 10 10 10" />,
  'chevron-right': <path d="m12 6 10 10-10 10" />,
  back: <path d="M26 16H7m8-9-9 9 9 9" />,
  warning: (
    <>
      <path d="M16 4.5 29 27H3Z" />
      <path d="M16 13v6" />
      <circle cx="16" cy="23" r="1.4" className="spark" />
    </>
  ),
  display: (
    <>
      <rect x="3.5" y="6" width="25" height="16.5" rx="4" />
      <path d="M11 27.500h10" />
      <circle cx="24" cy="10.500" r="1.500" className="spark" />
    </>
  ),
  access: (
    <>
      <circle cx="16" cy="6.500" r="2.200" className="spark" />
      <path d="M5.500 12c7 2 14 2 21 0M16 12.500v6.500m0 0-4.500 8M16 19l4.500 8" />
    </>
  ),
  network: (
    <>
      <path d="M4 13.500c7.200-6.200 16.800-6.200 24 0M8.500 18.500c4.200-3.500 10.800-3.500 15 0" />
      <circle cx="16" cy="24" r="2.200" className="spark" />
    </>
  ),
  ready: (
    <>
      <circle cx="16" cy="16" r="11" />
      <path d="m10.500 16.500 4 4 7-8" />
    </>
  ),
};

export interface IconProps {
  readonly name: IconName;
  /** Decorative by default; pass a label when the icon is the only thing naming a control. */
  readonly label?: string;
  readonly className?: string;
}

export function Icon({ name, label, className }: IconProps) {
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
      viewBox="0 0 32 32"
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      role={label === undefined ? undefined : 'img'}
    >
      {GLYPHS[name]}
    </svg>
  );
}
