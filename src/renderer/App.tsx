import { AppDataProvider, useAppData } from "./state/AppDataProvider";
import { NavigationProvider, useNavigation } from "./state/NavigationProvider";
import { ToastProvider } from "./state/ToastProvider";
import { ThemeProvider } from "./state/ThemeProvider";
import { Spinner } from "./components/ui/Spinner";
import { ErrorBanner } from "./components/ui/ErrorBanner";
import { AppShell } from "./components/layout/AppShell";
import { PrivacyGate } from "./components/onboarding/PrivacyGate";
import { SignInScreen } from "./components/onboarding/SignInScreen";
import { FirstRunFlow } from "./components/onboarding/FirstRunFlow";
import { PortfolioView } from "./components/portfolio/PortfolioView";
import { AccountDetailView } from "./components/account/AccountDetailView";
import { AllChangesView } from "./components/changes/AllChangesView";
import { TeamView } from "./components/team/TeamView";
import { PodsView } from "./components/pods/PodsView";
import { SettingsView } from "./components/settings/SettingsView";
import { UpdatesPanel } from "./components/settings/UpdatesPanel";
import { UpdateProvider } from "./state/UpdateProvider";
import { ToastViewport } from "./components/ui/ToastViewport";

function StartupUpdates() {
  const { state } = useAppData();
  if (state?.settings.privacyAccepted && state.auth.signedIn && state.overview.accounts.length > 0) return null;
  return (
    <>
      <details className="startup-updates">
        <summary>App updates</summary>
        <UpdatesPanel />
      </details>
      <ToastViewport />
    </>
  );
}

function RouteOutlet() {
  const { route } = useNavigation();
  switch (route.name) {
    case "portfolio":
      return <PortfolioView />;
    case "changes":
      return <AllChangesView />;
    case "team":
      return <TeamView />;
    case "pods":
      return <PodsView />;
    case "settings":
      return <SettingsView />;
    case "account":
      return <AccountDetailView accountId={route.accountId} tab={route.tab} />;
    default:
      return null;
  }
}

function AppContent() {
  const { loading, error, state, reload, saveSettings, signIn, refreshOverview } = useAppData();

  if (loading && !state) {
    return (
      <div className="gate-screen">
        <Spinner label="Loading CSU Console..." />
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="gate-screen">
        <div className="gate-card">
          <ErrorBanner message={error} onRetry={reload} />
        </div>
      </div>
    );
  }

  if (!state) return null;

  if (!state.settings.privacyAccepted) {
    return (
      <PrivacyGate
        onAccept={async () => {
          await saveSettings({ ...state.settings, privacyAccepted: true });
        }}
      />
    );
  }

  if (!state.auth.signedIn) {
    return (
      <SignInScreen
        onSignIn={async () => {
          await signIn();
        }}
      />
    );
  }

  if (state.overview.accounts.length === 0) {
    return (
      <FirstRunFlow
        settings={state.settings}
        onScopeSaved={async (settings) => {
          await saveSettings(settings);
        }}
        onAccountAdded={() => {
          void refreshOverview();
        }}
      />
    );
  }

  return (
    <AppShell
      identityName={state.auth.name ?? state.auth.username}
      changesBadge={state.overview.totals.pendingChanges}
    >
      <RouteOutlet />
    </AppShell>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <UpdateProvider>
          <AppDataProvider>
            <NavigationProvider>
              <AppContent />
              <StartupUpdates />
            </NavigationProvider>
          </AppDataProvider>
        </UpdateProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
