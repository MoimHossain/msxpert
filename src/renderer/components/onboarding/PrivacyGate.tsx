import { useState } from "react";
import { Button } from "../ui/Button";
import { ErrorBanner } from "../ui/ErrorBanner";
import { BrandMark } from "../layout/BrandMark";
import { Checkbox } from "@fluentui/react-components";

interface PrivacyGateProps {
  onAccept: () => Promise<void>;
}

export function PrivacyGate({ onAccept }: PrivacyGateProps) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setBusy(true);
    setError(null);
    try {
      await onAccept();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate-screen">
      <div className="gate-card">
        <BrandMark />
        <h1>Welcome to MCAPS Console</h1>
        <p>
          MCAPS Console is a local, read-only companion for your MSX portfolio. Before you
          sign in, please review how your data is handled.
        </p>
        <ul className="privacy-points">
          <li>Your MSX data, tokens, and portfolio configuration stay on this device.</li>
          <li>
            The application only performs read operations against MSX. It never
            creates or edits records in Dynamics 365.
          </li>
          <li>No product telemetry is enabled by default.</li>
          <li>
            You can back up, export, or permanently delete your local data at any time
            from Settings.
          </li>
        </ul>
        <Checkbox
            checked={checked}
            onChange={(_event, data) => setChecked(data.checked === true)}
            label="I understand and agree to these terms."
          />
        {error ? <ErrorBanner message={error} /> : null}
        <Button
          variant="primary"
          disabled={!checked}
          busy={busy}
          onClick={() => void handleContinue()}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
