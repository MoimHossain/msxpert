import { useState } from "react";
import { Button } from "../ui/Button";
import { ErrorBanner } from "../ui/ErrorBanner";

interface SignInScreenProps {
  onSignIn: () => Promise<void>;
}

export function SignInScreen({ onSignIn }: SignInScreenProps) {
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
        <h1>Sign in to MSX</h1>
        <p>
          CSU Console opens your default browser to complete sign-in with your
          Microsoft-managed identity. You will return here automatically once
          authentication succeeds.
        </p>
        {error ? (
          <ErrorBanner message={error} onRetry={() => void handleSignIn()} />
        ) : null}
        <Button variant="primary" busy={busy} onClick={() => void handleSignIn()}>
          Sign in to MSX
        </Button>
      </div>
    </div>
  );
}
