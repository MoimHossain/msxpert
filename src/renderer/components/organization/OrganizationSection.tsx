import { useOrganization } from "../../state/OrganizationProvider";
import { Button } from "../ui/Button";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Spinner } from "../ui/Spinner";

export function OrganizationSection() {
  const { state, loading, error, busy, discover, importCatalog, refreshLinks, importSummary, refresh, openManage, openProgress } = useOrganization();
  return <section className="settings-section organization-section" aria-labelledby="organization-heading">
    <h2 id="organization-heading">Organization</h2>
    <p>Import a shared organization catalog, manage local CSU / STU / ATU / ISD classifications, or discover milestone people.</p>
    <p className="field-hint">Import and Manage work locally without AI or Work IQ tests. Imported files are never uploaded.
      Use catalogs from trusted sources; their classifications are not independently verified.
      Refresh MSX links after importing to associate work addresses with milestone creators and owners; this uses MSX, not AI.</p>
    <p className="field-hint">Each exact work identity is checked independently. No manager chain or CVP lookup is required.
      Unavailable people remain unresolved; review Unknown roles and corrections in Manage. No MSX records are changed.</p>
    <p className="field-hint">MSX account: {state?.identity ?? "Sign in to MSX first"}.
      {" "}Work IQ uses its own existing sign-in; this app cannot independently verify that client's account.</p>
    {loading && !state ? <Spinner label="Loading organization..." /> : null}
    {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}
    {!state?.canDiscover ? <p className="callout" role="note">Only live discovery needs a successful Work IQ test. Import and Manage remain available.</p> : null}
    <div className="organization-actions">
      <Button variant="primary" disabled={!state?.identity || busy || loading}
        onClick={() => { void importCatalog().catch(() => undefined); }}>Import catalog</Button>
      <Button disabled={!state?.identity || loading} onClick={openManage}>Manage</Button>
      <Button disabled={!state?.identity || busy || loading}
        onClick={() => { void refreshLinks().catch(() => undefined); }}>Refresh MSX links</Button>
      <Button disabled={!state?.canDiscover || busy || loading}
        onClick={() => { void discover().catch(() => undefined); }}>Discover milestone people</Button>
      <Button variant="ghost" disabled={!state?.canDiscover || busy || loading}
        onClick={() => { void discover("hierarchy").catch(() => undefined); }}>Explore hierarchy (experimental)</Button>
      {state?.progress ? <Button variant="ghost" onClick={openProgress}>{busy ? "View discovery progress" : "View last discovery"}</Button> : null}
    </div>
    {importSummary ? <p className="callout" role="status">Catalog import complete: {importSummary.added} added, {importSummary.updated} updated,
      {" "}{importSummary.preservedManual} manual corrections and {importSummary.preservedNewer} newer records preserved
      {" "}({importSummary.total} catalog entries). Unlinked profiles need Refresh MSX links before they can augment milestones.</p> : null}
    <p className="field-hint">Experimental hierarchy exploration can omit entire branches or stop without usable profiles.
      It is separate from milestone-person discovery and does not prove complete directory coverage.</p>
    {state ? <p className="field-hint">{state.people.length} saved local record(s).
      {" "}Manual corrections survive rediscovery. Cached classifications remain available to milestones without live Work IQ access.</p> : null}
    {state?.linkError ? <ErrorBanner message={`MSX identity linking: ${state.linkError}`} /> : null}
  </section>;
}
