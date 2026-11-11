import { useCallback } from "react";
import { useAsync } from "./useAsync";
import type { AccountState } from "../../shared/types";

export function useAccountState(accountId: string) {
  const result = useAsync<AccountState>(
    () => window.desktop.getAccountState(accountId),
    [accountId],
  );

  const { reload } = result;
  const markReviewed = useCallback(async () => {
    const next = await window.desktop.markReviewed(accountId);
    reload();
    return next;
  }, [accountId, reload]);

  return { ...result, markReviewed };
}
