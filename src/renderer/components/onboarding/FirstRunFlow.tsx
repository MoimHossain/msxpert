import { useState } from "react";
import type { AppSettings } from "../../../shared/types";
import { ScopeEditor } from "./ScopeEditor";
import { AccountOnboarding } from "./AccountOnboarding";
import { BrandMark } from "../layout/BrandMark";
import { TerritoryPicker } from "./TerritoryPicker";
import { TerritoryImport } from "./TerritoryImport";

interface FirstRunFlowProps {
  settings: AppSettings;
  onScopeSaved: (settings: AppSettings) => Promise<void>;
  onComplete: () => Promise<void>;
}

type Step = "territories" | "scope" | "account";

export function FirstRunFlow({ settings, onScopeSaved, onComplete }: FirstRunFlowProps) {
  const [step, setStep] = useState<Step>("territories");
  const [savingScope, setSavingScope] = useState(false);
  const [manual, setManual] = useState(false);

  return (
    <div className="gate-screen">
      <div className="gate-card gate-card-wide">
        <BrandMark />
        <ol className="wizard-steps" aria-label="Setup progress">
          <li aria-current={step === "territories" ? "step" : undefined}>1. Sales territories</li>
          <li aria-current={step === "scope" ? "step" : undefined}>2. Milestone window</li>
          <li aria-current={step === "account" ? "step" : undefined}>3. Add customers</li>
        </ol>

        {step === "territories" ? <>
          <h1>Choose your sales territories</h1>
          <TerritoryPicker selectedIds={settings.territoryIds}
            onConfirm={async (ids) => {
              await onScopeSaved({ ...settings, territoryIds: ids });
              setManual(false);
              setStep("scope");
            }}
            onManual={() => { setManual(true); setStep("scope"); }} />
        </> : step === "scope" ? (
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
        ) : manual ? (
          <>
            <h1>Add your first customer</h1>
            <p>
              Search by customer name or enter a TPID. MCAPS Console always resolves and
              tracks the top-parent account to prevent duplicate milestones.
            </p>
            <AccountOnboarding onAdded={onComplete} onCancel={() => setStep("territories")} />
          </>
        ) : <TerritoryImport territoryIds={settings.territoryIds}
          onDone={onComplete} onBack={() => setStep("territories")} />}
      </div>
    </div>
  );
}
