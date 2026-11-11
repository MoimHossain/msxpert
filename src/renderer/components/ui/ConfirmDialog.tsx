import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, the confirm button stays disabled until the user types this exact phrase. */
  requirePhrase?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  requirePhrase,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const locked = Boolean(requirePhrase) && typed !== requirePhrase;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={() => void handleConfirm()}
            busy={busy}
            disabled={locked}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-body">{description}</div>
      {requirePhrase ? (
        <label className="field">
          <span className="field-label">
            Type <strong>{requirePhrase}</strong> to confirm
          </span>
          <input
            className="input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
        </label>
      ) : null}
    </Modal>
  );
}
