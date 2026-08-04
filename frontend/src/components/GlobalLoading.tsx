interface Props {
  /** When true, the overlay is visible. */
  active: boolean;
  /** Optional message displayed under the spinner. */
  message?: string;
}

export function GlobalLoading({ active, message }: Props) {
  if (!active) return null;

  return (
    <div className="global-loading-overlay" role="alert" aria-live="polite">
      <div className="global-loading-card">
        <div className="global-loading-spinner">
          <span />
          <span />
          <span />
        </div>
        {message && <p className="global-loading-text">{message}</p>}
      </div>
    </div>
  );
}
