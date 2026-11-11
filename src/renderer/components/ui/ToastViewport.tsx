import { useToast } from "../../state/ToastProvider";
import { classNames } from "../../lib/format";

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={classNames("toast", `toast-${toast.tone}`)}>
          <p>{toast.message}</p>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            {"\u2715"}
          </button>
        </div>
      ))}
    </div>
  );
}
