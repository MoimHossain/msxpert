import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FetchProgress } from "../../shared/fetch";
import type { FetchResult } from "../../shared/types";
import { useAppData } from "./AppDataProvider";
import { useToast } from "./ToastProvider";
import { useUpdateBlocker } from "./UpdateProvider";
import { FetchProgressPanel } from "../components/portfolio/FetchProgressPanel";

interface FetchContextValue {
  progress: FetchProgress | null;
  busy: boolean;
  fetchAccounts: (accountId?: string) => Promise<FetchResult>;
}
const FetchContext = createContext<FetchContextValue | null>(null);

export function FetchProvider({ children }: { children: ReactNode }) {
  const { state, refreshOverview } = useAppData();
  const { notify } = useToast();
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const lock = useRef(false);
  const lastId = useRef<string | null>(null);
  const completed = useRef(0);
  const busy = starting || Boolean(progress?.running);
  useUpdateBlocker(busy);

  useEffect(() => {
    let active = true;
    let received = false;
    const accept = (next: FetchProgress) => {
      if (!active) return;
      if (next.id !== lastId.current) { setOpen(true); lastId.current = next.id; completed.current = 0; }
      setProgress(next);
      if (next.completed > completed.current) {
        completed.current = next.completed;
        void refreshOverview().catch(error =>
          notify(`Could not reload refreshed accounts: ${error instanceof Error ? error.message : String(error)}`, "warning"));
      }
    };
    const unsubscribe = window.desktop.onFetchProgress(next => { received = true; accept(next); });
    void window.desktop.getFetchProgress().then(next => { if (!received && next?.running) accept(next); }).catch(error => {
      if (active) notify(`Could not read fetch progress: ${error instanceof Error ? error.message : String(error)}`, "warning");
    });
    return () => { active = false; unsubscribe(); };
  }, [notify, refreshOverview]);

  const fetchAccounts = useCallback(async (accountId?: string) => {
    if (lock.current || progress?.running) throw new Error("A portfolio refresh is already running.");
    lock.current = true; setStarting(true); setOpen(true);
    try { return await window.desktop.fetchAccounts(accountId); }
    finally { lock.current = false; setStarting(false); }
  }, [progress?.running]);

  const show = Boolean(state?.auth.signedIn && state.settings.onboardingComplete);
  return <FetchContext.Provider value={{ progress, busy, fetchAccounts }}>
    {children}
    {show && open && (progress || starting) ?
      <FetchProgressPanel progress={progress} onClose={() => setOpen(false)} /> : null}
    {show && !open && progress ? <button className="fetch-progress-reopen" type="button" onClick={() => setOpen(true)}>
      {busy ? "Fetching" : "Fetch results"}: {progress.completed}/{progress.total}
    </button> : null}
  </FetchContext.Provider>;
}

export function useFetch() {
  const value = useContext(FetchContext);
  if (!value) throw new Error("useFetch must be used within FetchProvider.");
  return value;
}
