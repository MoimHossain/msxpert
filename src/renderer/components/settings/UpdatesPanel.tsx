import { useState } from "react";
import { RELEASES_URL } from "../../../shared/updates";
import { useUpdates } from "../../state/UpdateProvider";
import { Button } from "../ui/Button";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Spinner } from "../ui/Spinner";

function bytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function UpdatesPanel() {
  const { state, error: serviceError } = useUpdates();
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const busy = state && ["checking", "downloading", "verifying", "installing"].includes(state.phase);
  const version = state?.release?.version;
  return (
    <section className="settings-section updates-panel" aria-label="App updates">
      <h2>Updates</h2>
      <p>Public GitHub Releases. No GitHub sign-in is required.</p>
      {state?.verification === "unsigned-test" ? (
        <p className="callout callout-warning" role="note">
          Unsigned test build. Updates check file integrity and version, but do not verify a trusted publisher.
          Only alpha test releases are offered. Do not use this build for production.
        </p>
      ) : null}
      <dl className="fact-grid">
        <div className="fact-row"><dt>Installed version</dt><dd>{state?.installedVersion ?? "Loading..."}</dd></div>
        <div className="fact-row"><dt>Source</dt><dd>{RELEASES_URL}</dd></div>
        <div className="fact-row">
          <dt>Last successful check</dt>
          <dd>{state?.lastCheckedAt ? new Date(state.lastCheckedAt).toLocaleString() : "Not checked"}</dd>
        </div>
      </dl>
      {error || serviceError ? <ErrorBanner message={error ?? serviceError ?? ""} /> : null}
      {!state && !serviceError ? <Spinner label="Loading update status..." /> : null}
      <div aria-live="polite" aria-atomic="true">
        {state?.message ? (
          <p role={state.phase === "error" ? "alert" : "status"}>{state.message}</p>
        ) : null}
        {state?.retryAt ? <p>Next check after {new Date(state.retryAt).toLocaleString()}.</p> : null}
        {state?.phase === "checking" ? <Spinner label="Checking for updates..." /> : null}
        {state?.phase === "verifying" ? <Spinner label={state.verification === "unsigned-test" ? "Verifying test installer integrity and version..." : "Verifying the signed installer..."} /> : null}
        {state?.phase === "downloading" ? (
          <div>
            <p>Downloading update{state.progress ? `: ${state.progress.percent.toFixed(0)}% (${bytes(state.progress.transferred)} / ${bytes(state.progress.total)})` : "..."}</p>
            <progress aria-label="Update download" max={100} value={state.progress?.percent} />
          </div>
        ) : null}
      </div>
      {state?.release ? (
        <div className="update-release">
          <h3>Version {state.release.version}{state.phase === "available" ? " is available" : ""}</h3>
          <p className="field-hint">
            {state.release.publishedAt ? new Date(state.release.publishedAt).toLocaleDateString() : ""}
            {state.release.size ? ` - ${bytes(state.release.size)}` : ""}
          </p>
          <pre className="update-release-notes">{state.release.notes || "See Releases for details."}</pre>
        </div>
      ) : null}
      <div className="settings-actions">
        <Button
          disabled={!state || Boolean(busy) || state.phase === "unsupported"}
          onClick={() => void run(() => window.desktop.checkForUpdates())}
        >
          Check for updates
        </Button>
        {state?.phase === "available" && state.release ? (
          <Button variant="primary" onClick={() => version && void run(() => window.desktop.downloadAndRestart(version))}>
            Update and restart
          </Button>
        ) : null}
        {state?.phase === "ready" && state.release ? (
          <Button variant="primary" onClick={() => version && void run(() => window.desktop.restartToUpdate(version))}>
            Restart to update
          </Button>
        ) : null}
        {state?.phase === "downloading" ? (
          <Button disabled={state.message === "Cancelling download..."} onClick={() => void run(() => window.desktop.cancelUpdateDownload())}>
            Cancel download
          </Button>
        ) : null}
        <Button variant="ghost" disabled={state?.phase === "installing"} onClick={() => void run(() => window.desktop.openReleases())}>
          Open releases
        </Button>
      </div>
      {state?.phase === "available" ? (
        <p className="field-hint">Your work is kept. The app restarts after download and verification, or waits for you to finish active work and save edits.</p>
      ) : null}
    </section>
  );
}
