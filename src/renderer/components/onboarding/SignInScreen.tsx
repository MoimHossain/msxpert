import { useState } from "react";
import { Button } from "../ui/Button";
import { ErrorBanner } from "../ui/ErrorBanner";
import { BrandMark } from "../layout/BrandMark";

interface SignInScreenProps {
  onSignIn: () => Promise<void>;
  message?: string | null;
}

export function SignInScreen({ onSignIn, message }: SignInScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSignIn();
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
        <h1>Sign in to MSX</h1>
        <p>
          MCAPS Console opens your default browser to complete sign-in with your
          Microsoft-managed identity. You will return here automatically once
          authentication succeeds.
        </p>
        {error || message ? (
          <ErrorBanner message={error ?? message ?? ""} onRetry={() => void handleSignIn()} />
        ) : null}
        <Button variant="primary" busy={busy} onClick={() => void handleSignIn()}>
          Sign in with MSX
        </Button>
        {busy ? <Button onClick={() => void window.desktop.cancelSignIn().catch(() =>
          setError("Sign-in could not be cancelled. Please retry."))}>Cancel sign-in</Button> : null}
      </div>
    </div>
  );
}
