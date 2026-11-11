import { useState } from "react";
import type { PortfolioAccount } from "../../../shared/types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { ErrorBanner } from "../ui/ErrorBanner";

interface RemoveAccountDialogProps {
  account: Pick<PortfolioAccount, "id" | "name">;
  onCancel: () => void;
  onRemoved: () => void;
}

export function RemoveAccountDialog({ account, onCancel, onRemoved }: RemoveAccountDialogProps) {
  const [deleteHistory, setDeleteHistory] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = deleteHistory && confirmText !== account.name;

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.desktop.removeAccount(account.id, deleteHistory);
      onRemoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Remove ${account.name}`}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            busy={busy}
            disabled={locked}
            onClick={() => void handleRemove()}
          >
            Remove account
          </Button>
        </>
      }
    >
      <p>This removes {account.name} from your tracked portfolio. This never affects MSX.</p>
      <div className="radio-group">
        <label className="radio-row">
          <input
            type="radio"
            name="remove-mode"
            checked={!deleteHistory}
            onChange={() => setDeleteHistory(false)}
          />
          <span>
            <strong>Remove from portfolio, keep local history</strong>
            <br />
            Snapshots, runs, and change history stay on disk in case you add this
            account again later.
          </span>
        </label>
        <label className="radio-row">
          <input
            type="radio"
            name="remove-mode"
            checked={deleteHistory}
            onChange={() => setDeleteHistory(true)}
          />
          <span>
            <strong>Remove and delete all local data</strong>
            <br />
            Permanently deletes every snapshot, run, and change record for this
            account from this device.
          </span>
        </label>
      </div>
      {deleteHistory ? (
        <label className="field">
          <span className="field-label">
            Type <strong>{account.name}</strong> to confirm permanent deletion
          </span>
          <input
            className="input"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            autoComplete="off"
          />
        </label>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
    </Modal>
  );
}
