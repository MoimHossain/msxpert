import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AcrProgress, AcrState } from "../../shared/acr";
import { useAppData } from "./AppDataProvider";
import { useToast } from "./ToastProvider";
import { useUpdateBlocker } from "./UpdateProvider";
import { AcrProgressPanel } from "../components/acr/AcrProgressPanel";

interface AcrContextValue {
  state: AcrState | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  pending: "connect" | "fetch" | "disconnect" | null;
  refresh: () => void;
  connect: () => void;
  disconnect: () => void;
  fetch: () => void;
  cancel: () => void;
  openProgress: () => void;
}
const AcrContext = createContext<AcrContextValue | null>(null);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function AcrProvider({ children }: { children: ReactNode }) {
  const { state: app } = useAppData();
  const { notify } = useToast();
  const enabled = Boolean(app?.auth.signedIn && !app.auth.checking &&
    app.settings.privacyAccepted && app.settings.onboardingComplete);
  const scope = enabled ? JSON.stringify([app!.auth.username,
    app!.overview.accounts.map(account => [account.id, account.tpid]).sort()]) : "";
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [loaded, setLoaded] = useState("");
  const [state, setState] = useState<AcrState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AcrContextValue["pending"]>(null);
  const [open, setOpen] = useState(false);
  const reads = useRef(0);
  const latest = useRef<AcrProgress | null>(null);
  const lock = useRef(false);
  const scopeId = useRef<string | null>(null);
  const visible = Boolean(scope && scope === loaded);
  const progress = visible ? state?.progress ?? null : null;
  const busy = visible && (pending !== null || Boolean(progress?.running));
  useUpdateBlocker(busy);

  const refresh = useCallback(async () => {
    const requestScope = currentScope.current;
    if (!requestScope) return;
    const request = ++reads.current;
    setLoading(true);
    try {
      const next = await window.desktop.getAcrState();
      if (requestScope !== currentScope.current || request !== reads.current) return;
      scopeId.current = next.scopeId;
      const event = latest.current;
      setState({ ...next, progress: event?.scopeId === next.scopeId ? event : next.progress });
      setLoaded(requestScope);
      setError(null);
    } catch (reason) {
      if (requestScope === currentScope.current && request === reads.current) setError(message(reason));
    } finally {
      if (requestScope === currentScope.current && request === reads.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    ++reads.current;
    scopeId.current = null;
    latest.current = null;
    setState(null); setLoaded(""); setPending(null); setOpen(false); setError(null); setLoading(false);
    lock.current = false;
    if (!scope) return;
    const stop = window.desktop.onAcrProgress(next => {
      if (scope !== currentScope.current || next.scopeId !== scopeId.current) return;
      latest.current = next;
      setState(previous => previous?.scopeId === next.scopeId ? { ...previous, progress: next } : previous);
    });
    void refresh();
    return () => { ++reads.current; stop(); };
  }, [scope, refresh]);

  const run = useCallback(async (action: NonNullable<AcrContextValue["pending"]>) => {
    const requestScope = currentScope.current;
    if (!requestScope || lock.current) return;
    lock.current = true;
    setPending(action);
    setError(null);
    if (action === "fetch") {
      latest.current = null;
      setState(previous => previous ? { ...previous, progress: null } : previous);
      setOpen(true);
    }
    try {
      const next = await (action === "connect" ? window.desktop.connectPowerBi()
        : action === "disconnect" ? window.desktop.disconnectPowerBi() : window.desktop.fetchAcr());
      if (requestScope !== currentScope.current) return;
      ++reads.current;
      setLoading(false);
      setState(next); setLoaded(requestScope); scopeId.current = next.scopeId;
      notify(action === "fetch" ? "ACR snapshot refreshed." : action === "connect"
        ? "Power BI connected for your selected employee." : "Power BI disconnected.", "positive");
    } catch (reason) {
      if (requestScope !== currentScope.current) return;
      await refresh();
      if (requestScope !== currentScope.current) return;
      const text = message(reason);
      setError(text);
      notify(text, latest.current?.phase === "cancelled" ? "warning" : "critical");
    } finally {
      if (requestScope === currentScope.current) { lock.current = false; setPending(null); }
    }
  }, [notify, refresh]);

  const cancel = async () => {
    const requestScope = currentScope.current;
    try { await window.desktop.cancelAcr(); } catch (reason) {
      if (requestScope === currentScope.current) {
        setError(message(reason));
        notify("Could not stop the ACR operation.", "critical");
      }
    }
  };
  return <AcrContext.Provider value={{
    state: visible ? state : null, loading, error: scope ? error : null, busy, pending: visible ? pending : null,
    refresh: () => { void refresh(); }, connect: () => { void run("connect"); },
    disconnect: () => { void run("disconnect"); }, fetch: () => { void run("fetch"); },
    cancel: () => { void cancel(); }, openProgress: () => setOpen(true),
  }}>
    {children}
    {scope && open && (progress || pending === "fetch") ? <AcrProgressPanel progress={progress}
      onClose={() => setOpen(false)} onCancel={() => { void cancel(); }} /> : null}
  </AcrContext.Provider>;
}
export function useAcr() {
  const context = useContext(AcrContext);
  if (!context) throw new Error("ACR must be used within AcrProvider.");
  return context;
}
