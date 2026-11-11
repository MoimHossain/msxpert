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

export function SettingsView() {
  const { auth, settings, dataPath, version, overview } = useLoadedAppData();
  const { saveSettings, signOut, resetSetup } = useAppData();
  const { navigate } = useNavigation();
  const { notify } = useToast();

  const [signingOut, setSigningOut] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const [retention, setRetention] = useState(settings.retentionSnapshots);
  const [savingRetention, setSavingRetention] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  useUpdateBlocker(retention !== settings.retentionSnapshots);
  useUpdateBlocker(resetOpen || resetting);

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

      <UpdatesPanel />

      <section className="settings-section reset-section">
        <div className="section-heading"><span className="section-icon"><ArrowReset24Regular /></span><h2>Reset setup</h2></div>
        <p>Start again with the same welcome, privacy, sign-in, and configuration screens you saw on first launch.</p>
        <p className="field-hint">
          Tracked customers will be archived, not deleted. Saved customer data, history, team, and POD records stay on this device.
          Re-adding a customer reconnects its retained history. You will be signed out and setup preferences will return to defaults.
        </p>
        <Button variant="secondary" onClick={() => setResetOpen(true)}>Reset setup</Button>
      </section>

      {resetOpen ? (
        <ConfirmDialog
          title="Reset setup?"
          confirmLabel="Reset and start again"
          requirePhrase="RESET"
          description={<p>This signs you out, archives all tracked customers, and resets setup preferences and privacy consent. Your database, customer history, team, and POD records are kept. Any unsaved settings on this page will be discarded.</p>}
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
