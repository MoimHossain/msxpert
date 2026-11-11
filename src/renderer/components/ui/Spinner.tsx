interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = "Loading" }: SpinnerProps) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="spinner-label">{label}</span>
    </div>
  );
}
