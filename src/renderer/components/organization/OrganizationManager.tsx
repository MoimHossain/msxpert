import { useMemo, useState } from "react";
import { ORG_UNITS, type OrgPerson } from "../../../shared/organization";
import { useOrganization } from "../../state/OrganizationProvider";
import { useUpdateBlocker } from "../../state/UpdateProvider";
import { SidePanel } from "../ui/SidePanel";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { SelectField } from "../ui/SelectField";
import { Badge } from "../ui/Badge";
import { Spinner } from "../ui/Spinner";
import { ErrorBanner } from "../ui/ErrorBanner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { OrganizationPersonEditor } from "./OrganizationPersonEditor";

export function OrganizationManager({ onClose }: { onClose: () => void }) {
  const { state, loading, error, busy, refresh, savePerson, removePerson, openProgress } = useOrganization();
  const [term, setTerm] = useState("");
  const [unit, setUnit] = useState("");
  const [editing, setEditing] = useState<OrgPerson | "new" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [removing, setRemoving] = useState<OrgPerson | null>(null);
  const [discard, setDiscard] = useState<"close" | "edit" | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const readonly = busy || !state?.identity;
  useUpdateBlocker(dirty || Boolean(removing));
  const people = state?.people;
  const counts = useMemo(() => ORG_UNITS.map(org => ({
    org, count: people?.filter(person => person.org === org).length ?? 0,
  })), [people]);
  const filtered = useMemo(() => {
    const query = term.trim().toLocaleLowerCase();
    return (people ?? []).filter(person => (!unit || person.org === unit) &&
      [person.name, person.upn, person.alias, person.jobTitle, person.org].some(value => value.toLocaleLowerCase().includes(query)))
      .sort((a, b) => a.name.localeCompare(b.name) || a.upn.localeCompare(b.upn));
  }, [people, term, unit]);
  const closeEditor = () => { setEditing(null); setDirty(false); };
  const requestClose = () => { if (dirty) setDiscard("close"); else onClose(); };

  return <SidePanel title="Manage organization" onClose={requestClose} wide>
    <div className="organization-drawer organization-manager">
      <p className="field-hint">Local CSU / STU / ATU / ISD classifications. Imported records and manual corrections survive discovery.
        Records older than 30 days are marked stale, not deleted. No employee or organization changes are written to MSX.</p>
      {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}
      {state?.linkError ? <ErrorBanner message={`MSX identity linking: ${state.linkError}`} /> : null}
      {busy ? <p className="callout" role="note">Stop discovery to edit this directory. You can browse cached records while it runs.
        {" "}<Button variant="ghost" onClick={openProgress} disabled={dirty}>View discovery progress</Button></p> : null}
      {!state?.identity ? <p className="callout" role="note">Sign in to MSX to access your account's local directory. AI tests are not required.</p> : null}
      {editing ? <OrganizationPersonEditor key={editing === "new" ? "new" : editing.id}
        person={editing === "new" ? null : editing} disabled={readonly} onDirtyChange={setDirty}
        onCancel={() => { if (dirty) setDiscard("edit"); else closeEditor(); }}
        onSave={async input => { await savePerson(input); closeEditor(); }} /> : <>
        <div className="organization-actions">
          <Button variant="primary" disabled={readonly || !state} onClick={() => setEditing("new")}>Add person</Button>
          <Button disabled={loading} onClick={() => void refresh()}>Refresh local cache</Button>
          <span>{state?.people.length ?? 0} saved record(s)</span>
        </div>
        <div className="organization-directory-filters">
          <TextField label="Search local directory" value={term} placeholder="Name, UPN, alias, title or unit"
            onChange={event => setTerm(event.target.value)} />
          <SelectField label="Organization unit" value={unit} onChange={event => setUnit(event.target.value)}>
            <option value="">All units ({state?.people.length ?? 0})</option>
            {counts.map(({ org, count }) => <option key={org} value={org}>{org} ({count})</option>)}
          </SelectField>
        </div>
        {loading && !state ? <Spinner label="Loading local directory..." /> : !state ? <p>Organization data is unavailable. Retry loading the local cache.</p> :
          !state.people.length ? <p>No local people yet. Import a catalog, discover milestone people, or add a person with their full work UPN.</p> :
          !filtered.length ? <p>No local people match these filters.</p> : <>
            <p className="field-hint">{filtered.length} matching record(s)</p>
            <ul className="organization-people">{filtered.map(person => {
              const stale = Number.isFinite(Date.parse(person.updatedAt)) && Date.now() - Date.parse(person.updatedAt) > 30 * 24 * 60 * 60 * 1000;
              return <li key={person.id} className="organization-person">
                <div className="organization-person-heading"><strong>{person.name}</strong>
                  <div className="organization-badges">
                    <Badge tone={person.org === "Unknown" ? "neutral" : "info"}>{person.org}</Badge>
                    <Badge tone={person.source === "manual" ? "warning" : "neutral"}>{person.source === "manual" ? "Manual override" : person.source === "imported" ? "Imported catalog" : "Discovered"}</Badge>
                    {!person.msxUserIds.length ? <Badge tone="warning">Unlinked</Badge> : null}
                    {stale ? <Badge tone="warning">Stale · over 30 days</Badge> : null}
                  </div>
                </div>
                <dl className="organization-person-details">
                  <div><dt>Work UPN</dt><dd>{person.upn}</dd></div>
                  <div><dt>Alias</dt><dd>{person.alias}</dd></div>
                  <div><dt>Title</dt><dd>{person.jobTitle || "Not supplied"}</dd></div>
                  <div><dt>Updated</dt><dd>{new Date(person.updatedAt).toLocaleString()}</dd></div>
                  <div><dt>MSX links</dt><dd>{person.msxUserIds.length ? `${person.msxUserIds.length} explicitly linked identity / identities` : "No exact MSX link"}</dd></div>
                </dl>
                <div className="organization-actions">
                  <Button disabled={readonly} onClick={() => setEditing(person)} aria-label={`Edit ${person.name}`}>Edit</Button>
                  <Button variant="ghost" disabled={readonly} onClick={() => { setRemoveError(null); setRemoving(person); }}
                    aria-label={`Remove ${person.name}`}>Remove</Button>
                </div>
              </li>;
            })}</ul>
          </>}
      </>}
      <div className="organization-drawer-footer"><Button onClick={requestClose}>Close</Button></div>
    </div>
    {removing ? <ConfirmDialog title="Remove local organization person?" confirmLabel="Remove local person" destructive
      description={<><p>Remove {removing.name} ({removing.upn}) from this workstation's organization directory?
        MSX records are not changed. Discovery may add an eligible person again.</p>
        {readonly ? <p>Finish the active organization operation and sign in to MSX before removing records.</p> : null}
        {removeError ? <ErrorBanner message={removeError} /> : null}</>}
      onCancel={() => setRemoving(null)} onConfirm={async () => {
        try { await removePerson(removing.id); setRemoving(null); }
        catch (reason) { setRemoveError(reason instanceof Error ? reason.message : String(reason)); }
      }} /> : null}
    {discard ? <ConfirmDialog title="Discard unsaved local edits?" confirmLabel="Discard edits"
      description={<p>Your unsaved changes will be lost. Saved directory records are not affected.</p>}
      onCancel={() => setDiscard(null)} onConfirm={() => {
        const close = discard === "close";
        setDiscard(null);
        closeEditor();
        if (close) onClose();
      }} /> : null}
  </SidePanel>;
}
