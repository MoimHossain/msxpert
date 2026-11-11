import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AppSettings,
  AuthState,
  BootstrapState,
  PodSummary,
  PortfolioOverview,
  TeamPerson,
} from "../../shared/types";

interface AppDataContextValue {
  loading: boolean;
  error: string | null;
  state: BootstrapState | null;
  reload: () => Promise<void>;
  refreshOverview: () => Promise<PortfolioOverview>;
  refreshTeam: () => Promise<TeamPerson[]>;
  refreshPods: () => Promise<PodSummary[]>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  signIn: () => Promise<AuthState>;
  signOut: () => Promise<AuthState>;
  resetSetup: () => Promise<void>;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootstrapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    setProfileError(null);
    try {
      const profile = await window.desktop.refreshProfile();
      setState((current) => current?.auth.signedIn ? { ...current, profile } : current);
    } catch (error) {
      setProfileError(errorMessage(error));
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.desktop.bootstrap();
      setState(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!state?.auth.checking) return;
    let cancelled = false;
    window.desktop.restoreSession().then((auth) => {
      if (!cancelled) setState((current) => current ? { ...current, auth } : current);
    }).catch(() => {
      if (!cancelled) setState((current) => current ? { ...current, auth: { ...current.auth,
        signedIn: false, checking: false, message: "Your session could not be restored. Sign in with MSX to retry." } } : current);
    });
    return () => { cancelled = true; };
  }, [state?.auth.checking]);

  useEffect(() => {
    if (state?.auth.signedIn) void refreshProfile();
  }, [state?.auth.signedIn, refreshProfile]);

  useEffect(() => window.desktop.onAuthRequired(() => {
    setState((current) => current ? { ...current, auth: { ...current.auth, signedIn: false,
      message: "Your MSX session expired. Sign in with MSX to continue." } } : current);
  }), []);

  const refreshOverview = useCallback(async () => {
    const overview = await window.desktop.getOverview();
    setState((current) => (current ? { ...current, overview } : current));
    return overview;
  }, []);

  const refreshTeam = useCallback(async () => {
    const team = await window.desktop.listTeam();
    setState((current) => (current ? { ...current, team } : current));
    return team;
  }, []);

  const refreshPods = useCallback(async () => {
    const pods = await window.desktop.listPods();
    setState((current) => (current ? { ...current, pods } : current));
    return pods;
  }, []);

  const saveSettings = useCallback(async (settings: AppSettings) => {
    const saved = await window.desktop.updateSettings(settings);
    setState((current) => (current ? { ...current, settings: saved } : current));
    return saved;
  }, []);

  const signIn = useCallback(async () => {
    const auth = await window.desktop.signIn();
    setState((current) => (current ? { ...current, auth, profile: null } : current));
    return auth;
  }, []);

  const signOut = useCallback(async () => {
    const auth = await window.desktop.signOut();
    setState((current) => (current ? { ...current, auth, profile: null } : current));
    setProfileError(null);
    return auth;
  }, []);

  const resetSetup = useCallback(async () => {
    try {
      setState(await window.desktop.resetSetup());
      setProfileError(null);
    } catch (err) {
      await reload();
      throw err;
    }
  }, [reload]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      loading,
      error,
      state,
      reload,
      refreshOverview,
      refreshTeam,
      refreshPods,
      saveSettings,
      signIn,
      signOut,
      resetSetup,
      profileError,
      refreshProfile,
    }),
    [
      loading,
      error,
      state,
      reload,
      refreshOverview,
      refreshTeam,
      refreshPods,
      saveSettings,
      signIn,
      signOut,
      resetSetup,
      profileError,
      refreshProfile,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("useAppData must be used within an AppDataProvider.");
  return context;
}

/** Convenience accessor for call sites that only render once `state` is guaranteed set. */
export function useLoadedAppData(): BootstrapState {
  const { state } = useAppData();
  if (!state) throw new Error("App data has not finished loading yet.");
  return state;
}
