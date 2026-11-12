import { useState } from "react";
import { useLoadedAppData, useAppData } from "../../state/AppDataProvider";
import { useNavigation } from "../../state/NavigationProvider";
import { useToast } from "../../state/ToastProvider";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { ScopeEditor } from "../onboarding/ScopeEditor";
import { UpdatesPanel } from "./UpdatesPanel";
import { useUpdateBlocker } from "../../state/UpdateProvider";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ArrowReset24Regular } from "@fluentui/react-icons";
import { Avatar } from "@fluentui/react-components";
import { ErrorBanner } from "../ui/ErrorBanner";
import { AiConnectionsPanel } from "./AiConnectionsPanel";
import { useTheme } from "../../state/ThemeProvider";
import { Checkbox, Radio, RadioGroup } from "@fluentui/react-components";

export function SettingsView() {
  const { auth, profile, settings, dataPath, version, overview } = useLoadedAppData();
  const { saveSettings, signOut, resetSetup, profileError, refreshProfile } = useAppData();
  const { navigate } = useNavigation();
  const { notify } = useToast();
  const { theme, toggleTheme } = useTheme();

  const [signingOut, setSigningOut] = useState(false);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const [retention, setRetention] = useState(settings.retentionSnapshots);
  const [savingRetention, setSavingRetention] = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  useUpdateBlocker(retention !== settings.retentionSnapshots);
  useUpdateBlocker(resetOpen || resetting);
  useUpdateBlocker(refreshingProfile);
  useUpdateBlocker(savingFeatures);

  const saveFeature = async (feature: "teamEnabled" | "podsEnabled", enabled: boolean) => {
    setSavingFeatures(true);
    try {
      await saveSettings({ ...settings, [feature]: enabled });
      notify(`${feature === "teamEnabled" ? "Team" : "PODs"} ${enabled ? "enabled." : "hidden. Saved records are kept."}`, "positive");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "critical");
    } finally {
      setSavingFeatures(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      notify("Signed out. Local data was kept on this device.", "positive");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "critical");
    } finally {
      setSigningOut(false);
    }
  };

  const saveRetention = async () => {
    setSavingRetention(true);
    try {
      await saveSettings({ ...settings, retentionSnapshots: retention });
      notify("Retention updated.", "positive");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "critical");
    } finally {
      setSavingRetention(false);
    }
  };

  return (
    <div className="settings-page">
      <PageHeader title="Settings" subtitle="Identity, appearance, AI connections, and local data for this device." />

      <section className="settings-section appearance-settings" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Appearance</h2>
        <p>Choose the theme for this device.</p>
        <RadioGroup aria-label="Color theme" layout="horizontal" value={theme}
          onChange={(_event, data) => { if (data.value !== theme) toggleTheme(); }}>
          <Radio value="light" label="Light" />
          <Radio value="dark" label="Dark" />
        </RadioGroup>
      </section>

      <AiConnectionsPanel />

      <section className="settings-section">
        <h2>Identity</h2>
        {auth.signedIn ? (
          <>
            <div className="settings-profile">
              <Avatar name={profile?.displayName ?? auth.name ?? "User"} size={64} color="colorful"
                {...(profile?.photoDataUrl ? { image: { src: profile.photoDataUrl } } : {})} />
              <div><strong>{profile?.displayName ?? auth.name ?? auth.username}</strong>
                <p>{profile?.jobTitle}</p><p>{profile?.email ?? auth.username}</p>
                <p>{[profile?.department, profile?.officeLocation].filter(Boolean).join(" / ")}</p>
              </div>
            </div>
            {profileError ? <ErrorBanner message={profileError} onRetry={() => void refreshProfile()} /> : null}
            <Button variant="secondary" busy={refreshingProfile} onClick={() => {
              setRefreshingProfile(true);
              void refreshProfile().finally(() => setRefreshingProfile(false));
            }}>Refresh MSX profile</Button>
            <p className="field-hint">Profile details come from MSX. When no MSX photo is available, your initials are shown.</p>
            <p>
              Signed in as <strong>{auth.name ?? auth.username ?? "Unknown user"}</strong>
              {auth.username ? ` (${auth.username})` : ""}
            </p>
            <Button variant="secondary" busy={signingOut} onClick={() => void handleSignOut()}>
              Sign out
            </Button>
            <p className="field-hint">
              Signing out clears your MSX session. Your portfolio, team, and history stay
              on this device.
            </p>
          </>
        ) : (
          <p>Not signed in.</p>
        )}
      </section>

      <section className="settings-section">
        <h2>Portfolio accounts</h2>
        <p>
          {overview.accounts.length} account(s) tracked. Add, fetch, or remove accounts
          from the Portfolio page.
        </p>
        <p>{settings.territoryIds.length} sales territories selected. Use Add customer on Portfolio to review or change the selection and import more top parents.</p>
        <Button variant="secondary" onClick={() => navigate({ name: "portfolio" })}>
          Go to Portfolio
        </Button>
      </section>

      <section className="settings-section">
        <h2>Milestone window</h2>
        <ScopeEditor
          value={settings.scope}
          busy={savingScope}
          saveLabel="Save scope"
          onSave={async (scope) => {
            setSavingScope(true);
            try {
              await saveSettings({ ...settings, scope });
              notify("Milestone window updated.", "positive");
            } finally {
              setSavingScope(false);
            }
          }}
        />
      </section>

      <section className="settings-section workspace-features" aria-labelledby="workspace-features-heading" aria-busy={savingFeatures}>
        <h2 id="workspace-features-heading">Team and PODs</h2>
        <p>Choose which features appear in your workspace. Turning a feature off hides its page without deleting saved records.</p>
        <div className="workspace-feature">
          <div>
            <Checkbox label="Enable Team" checked={settings.teamEnabled} disabled={savingFeatures}
              onChange={(_event, data) => void saveFeature("teamEnabled", Boolean(data.checked))} />
            <p className="field-hint">Manage your roster as a team manager. Off by default.</p>
          </div>
          <Button variant="secondary" disabled={!settings.teamEnabled || savingFeatures} onClick={() => navigate({ name: "team" })}>
            Go to Team
          </Button>
        </div>
        <div className="workspace-feature">
          <div>
            <Checkbox label="Enable PODs" checked={settings.podsEnabled} disabled={savingFeatures}
              onChange={(_event, data) => void saveFeature("podsEnabled", Boolean(data.checked))} />
            <p className="field-hint">Organize people and accounts into PODs. On by default.</p>
          </div>
          <Button variant="secondary" disabled={!settings.podsEnabled || savingFeatures} onClick={() => navigate({ name: "pods" })}>
            Go to PODs
          </Button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Data</h2>
        <div className="scope-editor-grid">
          <TextField
            label="Snapshot retention"
            type="number"
            min={1}
            max={500}
            value={retention}
            onChange={(event) => setRetention(Number(event.target.value))}
            hint="Most recent snapshots kept per account, plus the first of each month."
          />
        </div>
        <Button variant="secondary" busy={savingRetention} onClick={() => void saveRetention()}>
          Save retention
        </Button>

        <dl className="fact-grid">
          <div className="fact-row">
            <dt>Data location</dt>
            <dd>{dataPath}</dd>
          </div>
          <div className="fact-row">
            <dt>Application version</dt>
            <dd>{version}</dd>
          </div>
        </dl>
      </section>

      <UpdatesPanel />

      <section className="settings-section reset-section">
        <div className="section-heading"><span className="section-icon"><ArrowReset24Regular /></span><h2>Reset setup</h2></div>
        <p>Start again with the same welcome, privacy, sign-in, and configuration screens you saw on first launch.</p>
        <p className="field-hint">
          Tracked customers will be archived, not deleted. Saved customer data, history, team, and POD records stay on this device.
          Re-adding a customer reconnects its retained history. Your profile, photo, tokens, and territory selection will be cleared.
        </p>
        <Button variant="secondary" onClick={() => setResetOpen(true)}>Reset setup</Button>
      </section>

      {resetOpen ? (
        <ConfirmDialog
          title="Reset setup?"
          confirmLabel="Reset and start again"
          requirePhrase="RESET"
          description={<p>This signs you out, clears your profile, photo, tokens, territory selection, and privacy consent, and archives tracked customers. Customer history, team, and POD records are kept. Unsaved settings will be discarded.</p>}
          onCancel={() => setResetOpen(false)}
          onConfirm={async () => {
            setResetting(true);
            try {
              await resetSetup();
              navigate({ name: "portfolio" });
              notify("Setup reset. Your saved data is still on this device.", "positive");
            } catch (error) {
              notify(error instanceof Error ? error.message : String(error), "critical");
            } finally {
              setResetting(false);
            }
          }}
        />
      ) : null}

      <section className="settings-section about-section">
        <h2>About MCAPS Console</h2>
        <p>
          MCAPS Console is built by <strong>Moim Hossain (CSA)</strong> to make MSX
          insights easier to discover, review, and act on while keeping customer data
          local to each manager's device.
        </p>
        <p className="field-hint">
          MCAPS Console is an independent productivity tool and is not an official
          Microsoft product.
        </p>
      </section>
    </div>
  );
}
