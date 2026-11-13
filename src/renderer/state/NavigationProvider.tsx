import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AccountTab = "dashboard" | "milestones" | "changes" | "history";

export type Route =
  | { name: "overview" }
  | { name: "portfolio" }
  | { name: "milestones" }
  | { name: "changes" }
  | { name: "team" }
  | { name: "pods" }
  | { name: "settings" }
  | { name: "account"; accountId: string; tab: AccountTab };

export type TopLevelRoute = Route["name"];

interface NavigationContextValue {
  route: Route;
  navigate: (route: Route) => void;
  goToAccount: (accountId: string, tab?: AccountTab) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ name: "overview" });

  const navigate = useCallback((next: Route) => setRoute(next), []);
  const goToAccount = useCallback(
    (accountId: string, tab: AccountTab = "dashboard") =>
      setRoute({ name: "account", accountId, tab }),
    [],
  );

  const value = useMemo(
    () => ({ route, navigate, goToAccount }),
    [route, navigate, goToAccount],
  );

  return (
    <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within a NavigationProvider.");
  }
  return context;
}
