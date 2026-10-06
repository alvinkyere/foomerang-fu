import { useMemo } from 'react';
import { createQrMatrix, qrPath } from '../qr';

/**
 * Draws the QR ourselves from the module matrix (a light code on dark would not scan reliably, so
 * it is always dark modules on a white card, with the required quiet zone). No library markup is
 * injected into the page.
 */
export function QrCode({ value, label }: { readonly value: string; readonly label: string }) {
  const { viewBox, d } = useMemo(() => qrPath(createQrMatrix(value)), [value]);
  return (
    <svg
      className="qr"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      shapeRendering="crispEdges"
    >
      <rect width={viewBox} height={viewBox} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
