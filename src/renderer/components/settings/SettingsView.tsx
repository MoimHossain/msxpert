import { useState } from "react";
import { useLoadedAppData, useAppData } from "../../state/AppDataProvider";
import { useNavigation } from "../../state/NavigationProvider";
import { useToast } from "../../state/ToastProvider";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { ScopeEditor } from "../onboarding/ScopeEditor";

export function SettingsView() {
  const { auth, settings, dataPath, version, overview } = useLoadedAppData();
  const { saveSettings, signOut } = useAppData();
  const { navigate } = useNavigation();
  const { notify } = useToast();

  const [signingOut, setSigningOut] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const [retention, setRetention] = useState(settings.retentionSnapshots);
  const [savingRetention, setSavingRetention] = useState(false);

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
    <div>
      <PageHeader title="Settings" subtitle="Identity, scope, and local data for this device." />

      <section className="settings-section">
        <h2>Identity</h2>
        {auth.signedIn ? (
          <>
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

      <section className="settings-section">
        <h2>Team and PODs</h2>
        <p>Manage roster members and PODs from their own pages.</p>
        <div className="settings-actions">
          <Button variant="secondary" onClick={() => navigate({ name: "team" })}>
            Go to Team
          </Button>
          <Button variant="secondary" onClick={() => navigate({ name: "pods" })}>
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

      <section className="settings-section about-section">
        <h2>About CSU Console</h2>
        <p>
          CSU Console is built by <strong>Moim Hossain (CSA)</strong> to make MSX
          insights easier to discover, review, and act on while keeping customer data
          local to each manager's device.
        </p>
        <p className="field-hint">
          CSU Console is an independent productivity tool and is not an official
          Microsoft product.
        </p>
      </section>
    </div>
  );
}
