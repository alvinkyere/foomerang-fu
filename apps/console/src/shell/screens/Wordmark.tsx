export function Wordmark({ size = 'md' }: { readonly size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`wordmark wordmark--${size}`} role="img" aria-label="Foomerang Fu">
      <span className="wordmark__top" aria-hidden="true">
        FOOMERANG
      </span>
      <span className="wordmark__fu" aria-hidden="true">
        FU
      </span>
    </span>
  );
}
