import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { OrgDiscoveryMode, OrgImportSummary, OrgPersonInput, OrgProgress, OrgState } from "../../shared/organization";
import { useAppData } from "./AppDataProvider";
import { useToast } from "./ToastProvider";
import { useUpdateBlocker } from "./UpdateProvider";
import { OrganizationProgressPanel } from "../components/organization/OrganizationProgressPanel";
import { OrganizationManager } from "../components/organization/OrganizationManager";

interface OrganizationContextValue {
  state: OrgState | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  discover: (mode?: OrgDiscoveryMode) => Promise<void>;
  importCatalog: () => Promise<void>;
  refreshLinks: () => Promise<void>;
  importSummary: OrgImportSummary | null;
  cancel: () => Promise<void>;
  savePerson: (input: OrgPersonInput) => Promise<void>;
  removePerson: (id: string) => Promise<void>;
  openProgress: () => void;
  openManage: () => void;
  setConnectionValidity: (valid: boolean) => void;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);
const message = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { state: app } = useAppData();
  const { notify } = useToast();
  const enabled = Boolean(app?.auth.signedIn && !app.auth.checking &&
    app.settings.privacyAccepted && app.settings.onboardingComplete);
  const scope = enabled ? JSON.stringify([app!.auth.username, app!.settings.scope, app!.settings.territoryIds]) : "";
  const [snapshot, setSnapshot] = useState<OrgState | null>(null);
  const [loadedScope, setLoadedScope] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [drawer, setDrawer] = useState<"progress" | "manage" | null>(null);
  const [connectionValid, setConnectionValid] = useState<boolean | null>(null);
  const [importSummary, setImportSummary] = useState<OrgImportSummary | null>(null);
  const generation = useRef(0);
  const reads = useRef(0);
  const events = useRef(0);
  const progress = useRef<OrgProgress | null>(null);
  const openedId = useRef<string | null>(null);
  const lock = useRef(false);
  const pendingRequests = useRef(0);
  const commands = useRef(0);
  const appliedCommand = useRef(0);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const visible = enabled && loadedScope === scope;
  const state = visible && snapshot ? { ...snapshot, canDiscover: snapshot.canDiscover && connectionValid !== false } : null;
  const busy = visible && (pending || Boolean(snapshot?.progress?.running));
  useUpdateBlocker(busy);

  const report = useCallback((reason: unknown) => {
    const text = message(reason);
    setError(text);
    notify("Organization request failed. Review Organization in Settings for details.", "critical");
  }, [notify]);

  const acceptProgress = useCallback((next: OrgProgress) => {
    progress.current = next;
    if (openedId.current !== next.id && next.running) {
      openedId.current = next.id;
      setDrawer("progress");
    }
    setSnapshot(current => current ? { ...current, progress: next } : current);
  }, []);

  const refresh = useCallback(async () => {
    if (!activeScope.current) return;
    const currentScope = activeScope.current;
    const epoch = generation.current;
    const request = ++reads.current;
    const before = events.current;
    setLoading(true);
    try {
      const next = await window.desktop.getOrganization();
      if (epoch !== generation.current || currentScope !== activeScope.current || request !== reads.current) return;
      const latest = before !== events.current ? progress.current : next.progress;
      setSnapshot({ ...next, progress: latest });
      setLoadedScope(currentScope);
      setError(null);
      if (latest) acceptProgress(latest);
    } catch (reason) {
      if (epoch === generation.current && currentScope === activeScope.current && request === reads.current) report(reason);
    } finally {
      if (epoch === generation.current && currentScope === activeScope.current && request === reads.current) setLoading(false);
    }
  }, [acceptProgress, report]);

  useEffect(() => {
    ++generation.current;
    ++reads.current;
    progress.current = null;
    openedId.current = null;
    lock.current = false;
    pendingRequests.current = 0;
    setSnapshot(null);
    setLoadedScope("");
    setDrawer(null);
    setPending(false);
    setError(null);
    setImportSummary(null);
    setLoading(false);
    if (!scope) return;
    let active = true;
    const stopProgress = window.desktop.onOrganizationProgress(next => {
      if (!active || activeScope.current !== scope) return;
      const previous = progress.current;
      ++events.current;
      acceptProgress(next);
      if (!previous || previous.id !== next.id || next.matched !== previous.matched ||
        next.saved !== previous.saved || !next.running) void refresh();
    });
    const stopChanged = window.desktop.onOrganizationChanged(() => {
      if (active && activeScope.current === scope) void refresh();
    });
    void refresh();
    return () => { active = false; ++generation.current; stopProgress(); stopChanged(); };
  }, [scope, refresh, acceptProgress]);

  const run = useCallback(async (action: () => Promise<OrgState>, stopping = false) => {
    if (!activeScope.current) throw new Error("Sign in and finish setup to manage your organization.");
    if (lock.current && !stopping) throw new Error("An organization request is already in progress.");
    const currentScope = activeScope.current;
    const epoch = generation.current;
    const command = ++commands.current;
    const before = events.current;
    if (!stopping) lock.current = true;
    ++pendingRequests.current;
    setPending(true);
    setError(null);
    try {
      const next = await action();
      if (epoch === generation.current && currentScope === activeScope.current && command >= appliedCommand.current) {
        appliedCommand.current = command;
        ++reads.current;
        setLoading(false);
        setLoadedScope(currentScope);
        const latest = stopping ? next.progress : before !== events.current ? progress.current : next.progress;
        setSnapshot({ ...next, progress: latest });
        if (latest) acceptProgress(latest);
      }
    } catch (reason) {
      if (epoch === generation.current && currentScope === activeScope.current) report(reason);
      throw reason;
    } finally {
      if (epoch === generation.current && currentScope === activeScope.current) {
        if (!stopping) lock.current = false;
        setPending(--pendingRequests.current > 0);
      }
    }
  }, [acceptProgress, report]);

  const discover = useCallback(async (mode: OrgDiscoveryMode = "milestones") => {
    if (!state?.canDiscover || busy) throw new Error("Complete the current Work IQ test before starting discovery.");
    setDrawer("progress");
    await run(() => window.desktop.discoverOrganization(mode));
  }, [state?.canDiscover, busy, run]);
  const cancel = useCallback(() => run(() => window.desktop.cancelOrganization(), true), [run]);
  const importCatalog = useCallback(async () => {
    if (!state?.identity || busy) throw new Error("Sign in to MSX and finish the active organization operation before importing.");
    setImportSummary(null);
    await run(async () => {
      const result = await window.desktop.importOrganizationCatalog();
      if (result) {
        if (activeScope.current === scope) setImportSummary(result.summary);
        return result.state;
      }
      return window.desktop.getOrganization();
    });
  }, [state?.identity, busy, run, scope]);
  const refreshLinks = useCallback(() => run(() => window.desktop.refreshOrganizationLinks()), [run]);
  const savePerson = useCallback((input: OrgPersonInput) => {
    if (!state?.identity || busy) return Promise.reject(new Error("Sign in to MSX and finish the active organization operation before editing."));
    return run(() => window.desktop.saveOrganizationPerson(input));
  }, [state?.identity, busy, run]);
  const removePerson = useCallback((id: string) => {
    if (!state?.identity || busy) return Promise.reject(new Error("Sign in to MSX and finish the active organization operation before editing."));
    return run(() => window.desktop.removeOrganizationPerson(id));
  }, [state?.identity, busy, run]);
  const setConnectionValidity = useCallback((valid: boolean) => {
    setConnectionValid(valid);
    void refresh();
  }, [refresh]);

  return <OrganizationContext.Provider value={{
    state, loading, error: visible || enabled ? error : null, busy, refresh, discover, cancel, savePerson, removePerson,
    importCatalog, refreshLinks, importSummary,
    openProgress: () => { if (enabled) setDrawer("progress"); },
    openManage: () => { if (state?.identity) setDrawer("manage"); },
    setConnectionValidity,
  }}>
    {children}
    {visible && drawer === "progress" ? <OrganizationProgressPanel onClose={() => setDrawer(null)} /> : null}
    {visible && drawer === "manage" ? <OrganizationManager onClose={() => setDrawer(null)} /> : null}
    {visible && drawer === null && snapshot?.progress ? <button className="organization-progress-reopen" type="button"
      onClick={() => setDrawer("progress")}>
      {snapshot.progress.running ? "Organization discovery" : "Organization results"} · {snapshot.progress.saved} saved
    </button> : null}
  </OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const value = useContext(OrganizationContext);
  if (!value) throw new Error("useOrganization must be used within OrganizationProvider.");
  return value;
}
