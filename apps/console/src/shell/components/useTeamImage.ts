import { useEffect, useState } from 'react';
import type { PackKind, Side } from '../../characters/teamRecolour';

const made = new Map<string, string>();

/**
 * A character picture (a select sheet or a still) in a team's colours (render/teamRecolour.ts), as a data URL; the original `url`
 * until it is made, and always when there is no side. Made once per picture and side: PICK TEAMS shows the circles recoloured the
 * moment a tile lands on a banner (ff physics hq 2.mp4 9:44).
 */
export function useTeamImage(url: string, kind: string, side: 'RED' | 'BLUE' | undefined): string {
  const key = side === undefined ? undefined : `${url}|${kind}|${side}`;
  const [done, setDone] = useState<{ key: string; src: string } | undefined>(
    key !== undefined && made.has(key) ? { key, src: made.get(key) as string } : undefined,
  );
  useEffect(() => {
    if (key === undefined || side === undefined || made.has(key)) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      // (the recolouring itself is fetched only when a team is being picked)
      void import('../../characters/teamRecolour').then(({ recolourPixels }) => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context === null) return;
        context.drawImage(img, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        recolourPixels(kind as PackKind, side === 'RED' ? 0 : 1, pixels.data);
        context.putImageData(pixels, 0, 0);
        const src = canvas.toDataURL('image/png');
        made.set(key, src);
        if (!cancelled) setDone({ key, src });
      });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [key, url, kind, side]);
  if (key === undefined) return url;
  return made.get(key) ?? (done?.key === key ? done.src : url);
}

export type { Side };
