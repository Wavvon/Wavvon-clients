interface Props {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
}

// Plain English (not t()) to match the other admin-section controls that
// skip the 4-locale translation catalog for newer, narrowly-scoped strings.
export function ErrorRetry({ message, onRetry, retryLabel }: Props) {
  return (
    <div className="error-retry">
      <p className="error-text">{message}</p>
      <button className="btn-secondary" onClick={onRetry}>{retryLabel ?? "Retry"}</button>
    </div>
  );
}
