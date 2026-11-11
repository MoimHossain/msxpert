import { useState } from "react";
import type { AppSettings, PortfolioAccount } from "../../../shared/types";
import { ScopeEditor } from "./ScopeEditor";
import { AccountOnboarding } from "./AccountOnboarding";
import { BrandMark } from "../layout/BrandMark";

interface FirstRunFlowProps {
  settings: AppSettings;
  onScopeSaved: (settings: AppSettings) => Promise<void>;
  onAccountAdded: (account: PortfolioAccount) => void;
}

type Step = "scope" | "account";

export function FirstRunFlow({ settings, onScopeSaved, onAccountAdded }: FirstRunFlowProps) {
  const [step, setStep] = useState<Step>("scope");
  const [savingScope, setSavingScope] = useState(false);

  return (
    <div className="gate-screen">
      <div className="gate-card gate-card-wide">
        <BrandMark />
        <ol className="wizard-steps" aria-label="Setup progress">
          <li aria-current={step === "scope" ? "step" : undefined}>1. Milestone window</li>
          <li aria-current={step === "account" ? "step" : undefined}>2. Add a customer</li>
        </ol>

        {step === "scope" ? (
          <>
            <h1>Set your milestone window</h1>
            <p>
              MCAPS Console fetches milestones within this date range and skips the
              statuses you exclude below. You can change this any time in Settings.
            </p>
            <ScopeEditor
              value={settings.scope}
              busy={savingScope}
              saveLabel="Continue"
              onSave={async (scope) => {
                setSavingScope(true);
                try {
                  await onScopeSaved({ ...settings, scope });
                  setStep("account");
                } finally {
                  setSavingScope(false);
                }
              }}
            />
          </>
        ) : (
          <>
            <h1>Add your first customer</h1>
            <p>
              Search by customer name or enter a TPID. MCAPS Console always resolves and
              tracks the top-parent account to prevent duplicate milestones.
            </p>
            <AccountOnboarding onAdded={onAccountAdded} />
          </>
        )}
      </div>
    </div>
  );
}
