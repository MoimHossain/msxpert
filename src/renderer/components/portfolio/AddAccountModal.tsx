import { useState } from "react";
import type { PortfolioAccount } from "../../../shared/types";
import { Modal } from "../ui/Modal";
import { AccountOnboarding } from "../onboarding/AccountOnboarding";
import { TerritoryPicker } from "../onboarding/TerritoryPicker";
import { TerritoryImport } from "../onboarding/TerritoryImport";
import { useAppData, useLoadedAppData } from "../../state/AppDataProvider";

interface AddAccountModalProps {
  existingAccounts: PortfolioAccount[];
  onClose: () => void;
  onAdded: (account: PortfolioAccount) => void;
  onOpenExisting: (accountId: string) => void;
}

export function AddAccountModal({
  existingAccounts,
  onClose,
  onAdded,
  onOpenExisting,
}: AddAccountModalProps) {
  const { settings } = useLoadedAppData();
  const { saveSettings, refreshOverview } = useAppData();
  const [step, setStep] = useState<"territories" | "import" | "manual">("territories");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Add customers" onClose={onClose} closeDisabled={busy} width="lg">
      {step === "territories" ? <TerritoryPicker selectedIds={settings.territoryIds}
        onConfirm={async (ids) => {
          setBusy(true);
          try { await saveSettings({ ...settings, territoryIds: ids }); setStep("import"); }
          finally { setBusy(false); }
        }}
        onManual={() => setStep("manual")} /> : step === "import" ?
        <TerritoryImport territoryIds={settings.territoryIds} onBusyChange={setBusy}
          onBack={() => setStep("territories")}
          onDone={async () => { await refreshOverview(); onClose(); }} /> :
      <AccountOnboarding
        existingAccounts={existingAccounts}
        onBusyChange={setBusy}
        onAdded={(account) => {
          onAdded(account);
          onClose();
        }}
        onOpenExisting={(accountId) => {
          onOpenExisting(accountId);
          onClose();
        }}
        onCancel={() => setStep("territories")}
      />}
    </Modal>
  );
}
