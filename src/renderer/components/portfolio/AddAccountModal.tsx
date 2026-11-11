import type { PortfolioAccount } from "../../../shared/types";
import { Modal } from "../ui/Modal";
import { AccountOnboarding } from "../onboarding/AccountOnboarding";

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
  return (
    <Modal title="Add a customer" onClose={onClose} width="lg">
      <AccountOnboarding
        existingAccounts={existingAccounts}
        onAdded={(account) => {
          onAdded(account);
          onClose();
        }}
        onOpenExisting={(accountId) => {
          onOpenExisting(accountId);
          onClose();
        }}
        onCancel={onClose}
      />
    </Modal>
  );
}
