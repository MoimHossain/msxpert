import { useEffect } from "react";
import { AppDataProvider, useAppData, useLoadedAppData } from "./state/AppDataProvider";
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
import { MilestonesView } from "./components/milestones/MilestonesView";
import { UpdatesPanel } from "./components/settings/UpdatesPanel";
import { UpdateProvider } from "./state/UpdateProvider";
import { ToastViewport } from "./components/ui/ToastViewport";
import { Avatar } from "@fluentui/react-components";
import { FetchProvider } from "./state/FetchProvider";
import { OrganizationProvider } from "./state/OrganizationProvider";

function StartupUpdates() {
  const { state } = useAppData();
  if (state?.settings.privacyAccepted && state.auth.signedIn && state.settings.onboardingComplete) return null;
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
  const { route, navigate } = useNavigation();
  const { settings } = useLoadedAppData();
  const disabled = (route.name === "team" && !settings.teamEnabled) ||
    (route.name === "pods" && !settings.podsEnabled);
  useEffect(() => {
    if (disabled) navigate({ name: "settings" });
  }, [disabled, navigate]);
  if (disabled) return null;
  switch (route.name) {
    case "portfolio":
      return <PortfolioView />;
    case "milestones":
      return <MilestonesView />;
    case "changes":
      return <AllChangesView />;
    case "team":
      return <TeamView />;
    case "pods":
      return <PodsView />;
    case "settings":
      return <SettingsView />;
    case "account":
      return <AccountDetailView key={route.accountId} accountId={route.accountId} tab={route.tab} />;
    default:
      return null;
  }
}

function AppContent() {
  const { loading, error, state, reload, saveSettings, signIn, refreshOverview } = useAppData();

  if (loading && !state) {
    return (
      <div className="gate-screen">
        <Spinner label="Loading MCAPS Console..." />
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

  if (state.auth.checking) {
    return <div className="gate-screen"><div className="gate-card">
      <Avatar name={state.profile?.displayName ?? state.auth.name ?? "User"} size={64} color="colorful"
        {...(state.profile?.photoDataUrl ? { image: { src: state.profile.photoDataUrl } } : {})} />
      <h1>{state.profile?.displayName ?? "Welcome back"}</h1>
      <p>{state.profile?.jobTitle}</p>
      <Spinner label="Restoring your MSX session..." />
    </div></div>;
  }

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
        message={state.auth.message ?? null}
        onSignIn={async () => {
          await signIn();
        }}
      />
    );
  }

  if (!state.settings.onboardingComplete) {
    return (
      <FirstRunFlow
        settings={state.settings}
        onScopeSaved={async (settings) => {
          await saveSettings(settings);
        }}
        onComplete={async () => {
          await refreshOverview();
          await saveSettings({ ...state.settings, onboardingComplete: true });
        }}
      />
    );
  }

  return (
    <AppShell
      identityName={state.auth.name ?? state.auth.username}
      identityUsername={state.auth.username}
      profile={state.profile}
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
            <FetchProvider>
            <OrganizationProvider>
            <NavigationProvider>
              <AppContent />
              <StartupUpdates />
            </NavigationProvider>
            </OrganizationProvider>
            </FetchProvider>
          </AppDataProvider>
        </UpdateProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
