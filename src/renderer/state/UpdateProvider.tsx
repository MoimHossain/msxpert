import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import type { UpdateState } from "../../shared/updates";
import { useToast } from "./ToastProvider";

interface UpdateContextValue {
  state: UpdateState | null;
  error: string | null;
  registerBlocker: (id: symbol, blocked: () => boolean) => () => void;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  const blockers = useRef(new Map<symbol, () => boolean>());
  const notified = useRef(false);
  const { notify } = useToast();
  const registerBlocker = useCallback((id: symbol, blocked: () => boolean) => {
    blockers.current.set(id, blocked);
    return () => { blockers.current.delete(id); };
  }, []);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.desktop.onUpdateState((next) => {
      receivedEvent = true;
      setState(next);
      setError(null);
      if (next.phase !== "installing") setFrozen(false);
    });
    const unsubscribeRestart = window.desktop.onUpdateRestart((request) => {
      const safe = ![...blockers.current.values()].some((blocked) => blocked());
      if (safe) flushSync(() => setFrozen(true));
      window.desktop.confirmUpdateRestart(request.id, safe).catch((err: unknown) => {
        if (!active) return;
        setFrozen(false);
        setError(err instanceof Error ? err.message : String(err));
      });
    });
    window.desktop.getUpdateState().then((next) => {
      if (active && !receivedEvent) setState(next);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      active = false;
      unsubscribe();
      unsubscribeRestart();
    };
  }, []);

  useEffect(() => {
    if (state?.outcome && !notified.current) {
      notified.current = true;
      notify(state.outcome, state.outcome.startsWith("Updated to") ? "positive" : "critical");
    }
  }, [state?.outcome, notify]);

  return (
    <UpdateContext.Provider value={{ state, error, registerBlocker }}>
      <div className="update-app-root" inert={frozen}>
        {children}
      </div>
      {frozen ? (
        <div className="update-restart-overlay" role="status" aria-live="assertive">
          Installing update and restarting...
        </div>
      ) : null}
    </UpdateContext.Provider>
  );
}

export function useUpdates(): UpdateContextValue {
  const context = useContext(UpdateContext);
  if (!context) throw new Error("Updates must be used within UpdateProvider.");
  return context;
}

export function useUpdateBlocker(blocked: boolean): void {
  const { registerBlocker } = useUpdates();
  const id = useRef(Symbol("update-blocker"));
  const current = useRef(blocked);
  useLayoutEffect(() => { current.current = blocked; }, [blocked]);
  useLayoutEffect(() => registerBlocker(id.current, () => current.current), [registerBlocker]);
}
