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
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootstrapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setState((current) => (current ? { ...current, auth } : current));
    return auth;
  }, []);

  const signOut = useCallback(async () => {
    const auth = await window.desktop.signOut();
    setState((current) => (current ? { ...current, auth } : current));
    return auth;
  }, []);

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
