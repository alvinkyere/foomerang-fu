import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A horizontal row of covers. It never scrolls the page: it slides its own track so the selected
 * cover is always fully on screen. With few games nothing moves at all.
 */
export function GameCarousel({
  selectedIndex,
  children,
}: {
  readonly selectedIndex: number;
  readonly children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const v = viewport.current;
    const t = track.current;
    const tile = t?.children[selectedIndex] as HTMLElement | undefined;
    if (!v || !t || !tile) return;
    const pad = 4 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const left = tile.offsetLeft;
    const right = left + tile.offsetWidth;
    setOffset((current) => {
      if (left - pad < -current) return -(left - pad);
      if (right + pad > -current + v.clientWidth) return -(right + pad - v.clientWidth);
      return current;
    });
  }, [selectedIndex]);

  return (
    <div className="carousel" ref={viewport}>
      <div
        className="carousel__track"
        ref={track}
        style={{ transform: `translate3d(${Math.min(0, offset)}px, 0, 0)` }}
      >
        {children}
      </div>
    </div>
  );
}
