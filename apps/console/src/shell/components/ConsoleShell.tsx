import { useEffect, useState, type ReactNode } from 'react';

export interface ConsoleShellProps {
  /** Background artwork for what is selected. Changing `artworkKey` crossfades to the new one. */
  readonly artwork?: string | undefined;
  readonly artworkKey: string;
  readonly top?: ReactNode;
  readonly bottom?: ReactNode;
  readonly children: ReactNode;
}

interface Layer {
  readonly key: string;
  readonly src: string | undefined;
}

/**
 * The frame every screen lives in: a full-bleed artwork backdrop, a top row, a content area and a
 * bottom row, all inside the player's screen margin. No scrolling, no chrome.
 */
export function ConsoleShell({ artwork, artworkKey, top, bottom, children }: ConsoleShellProps) {
  const [layers, setLayers] = useState<Layer[]>([{ key: artworkKey, src: artwork }]);
  if (layers.at(-1)?.key !== artworkKey) {
    setLayers([...layers.slice(-1), { key: artworkKey, src: artwork }]);
  }
  useEffect(() => {
    if (layers.length < 2) return undefined;
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 520);
    return () => clearTimeout(t);
  }, [layers]);

  return (
    <div className="shell">
      <div className="shell__art" aria-hidden="true">
        {layers.map((layer) => (
          <div
            key={layer.key}
            className={`shell__layer${layer.src === undefined ? ' shell__layer--plain' : ''}`}
            style={layer.src === undefined ? undefined : { backgroundImage: `url(${layer.src})` }}
          />
        ))}
        <div className="shell__scrim" />
      </div>
      <div className="shell__frame">
        <header className="shell__top">{top}</header>
        <main className="shell__main">{children}</main>
        <footer className="shell__bottom">{bottom}</footer>
      </div>
    </div>
  );
}
