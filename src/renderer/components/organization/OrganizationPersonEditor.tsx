import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ORG_UNITS, orgPersonInputSchema, type OrgPerson, type OrgPersonInput, type OrgUnit } from "../../../shared/organization";
import type { SystemUserSearchResult } from "../../../shared/types";
import { useUpdateBlocker } from "../../state/UpdateProvider";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { SelectField } from "../ui/SelectField";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Spinner } from "../ui/Spinner";

export function OrganizationPersonEditor({ person, disabled, onSave, onCancel, onDirtyChange }: {
  person: OrgPerson | null;
  disabled: boolean;
  onSave: (input: OrgPersonInput) => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [initial] = useState<OrgPersonInput>(() => ({
    ...(person ? { id: person.id } : {}),
    name: person?.name ?? "", upn: person?.upn ?? "", jobTitle: person?.jobTitle ?? "",
    org: person?.org ?? "Unknown", msxUserIds: [...(person?.msxUserIds ?? [])],
  }));
  const [form, setForm] = useState(initial);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SystemUserSearchResult[]>([]);
  const [linkedLabels, setLinkedLabels] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUpdateBlocker(dirty || saving);
  useLayoutEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    let active = true;
    setResults([]);
    setSearchError(null);
    setSearching(false);
    if (disabled || term.trim().length < 2) return;
    setSearching(true);
    const timer = setTimeout(() => {
      void window.desktop.searchUsers(term.trim()).then(found => {
        if (active) setResults(found.slice(0, 12));
      }).catch((reason: unknown) => {
        if (active) setSearchError(reason instanceof Error ? reason.message : String(reason));
      }).finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [term, disabled]);

  const select = (user: SystemUserSearchResult) => {
    if (disabled || saving) return;
    setForm(current => ({
      ...current,
      ...(!current.name && !current.upn ? { name: user.name, upn: user.email ?? "", jobTitle: user.title ?? "" } : {}),
      msxUserIds: current.msxUserIds.some(id => id.toLowerCase() === user.id.toLowerCase()) ?
        current.msxUserIds : [...current.msxUserIds, user.id],
    }));
    setLinkedLabels(current => ({ ...current, [user.id]: `${user.name}${user.email ? ` · ${user.email}` : ""}` }));
  };

  return <form className="organization-editor" onSubmit={event => {
    event.preventDefault();
    if (disabled || saving) return;
    const parsed = orgPersonInputSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(" · "));
      return;
    }
    setError(null);
    setSaving(true);
    void onSave(parsed.data).catch((reason: unknown) => {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (mounted.current) setSaving(false); });
  }}>
    <h3>{person ? "Edit local person" : "Add local person"}</h3>
    <p className="field-hint">Changes become manual overrides and survive discovery. Alias is derived from the work UPN;
      change the UPN to correct it. Organization is a local classification, not a creation-time organization record.</p>
    {error ? <ErrorBanner message={error} /> : null}
    <fieldset disabled={disabled || saving}>
      <legend>Person details</legend>
      <div className="organization-form-grid">
        <TextField label="Display name" required maxLength={300} value={form.name}
          onChange={event => setForm({ ...form, name: event.target.value })} />
        <TextField label="Full work UPN / email" required type="email" maxLength={500} value={form.upn}
          placeholder="person@contoso.example" onChange={event => setForm({ ...form, upn: event.target.value })} />
        <TextField label="Alias (derived from UPN)" value={form.upn.trim().split("@")[0] ?? ""} readOnly />
        <TextField label="Job title" maxLength={500} value={form.jobTitle}
          onChange={event => setForm({ ...form, jobTitle: event.target.value })} />
        <SelectField label="Organization unit" value={form.org}
          onChange={event => setForm({ ...form, org: event.target.value as OrgUnit })}>
          {ORG_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
        </SelectField>
      </div>
      <h4>Optional explicit MSX identity links</h4>
      <p className="field-hint">Select only identities you have verified belong to this person. Nothing is linked by display-name guess.
        Selecting a result prefills an empty name/UPN form. Existing links stay unless you remove them.</p>
      {form.msxUserIds.length ? <ul className="organization-links">{form.msxUserIds.map(id => <li key={id}>
        <span>{linkedLabels[id] ?? `Saved MSX link · ${id}`}</span>
        <Button type="button" variant="ghost" onClick={() => setForm({
          ...form, msxUserIds: form.msxUserIds.filter(link => link !== id),
        })}>Remove link</Button>
      </li>)}</ul> : <p className="field-hint">Unlinked: this local person will not classify MSX actors until an exact identity link is established.</p>}
      <TextField label="Find an MSX user to link" value={term} onChange={event => setTerm(event.target.value)}
        hint="Search by name or email (at least 2 characters). Shows up to 12 results; narrow the search if needed." />
      {searching ? <Spinner label="Searching MSX users..." /> : null}
      {searchError ? <ErrorBanner message={searchError} /> : null}
      {!searching && !searchError && term.trim().length >= 2 && !results.length ? <p className="field-hint">No matching MSX users.</p> : null}
      {results.length ? <ul className="organization-user-results">{results.map(user => {
        const selected = form.msxUserIds.some(id => id.toLowerCase() === user.id.toLowerCase());
        return <li key={user.id}>
          <div><strong>{user.name}</strong><p>{user.email ?? "No email supplied"}</p><p>{user.title}</p>
            {user.disabled ? <p>Disabled MSX user</p> : null}</div>
          <Button type="button" disabled={selected || user.disabled} onClick={() => select(user)}>{selected ? "Selected" : "Select"}</Button>
        </li>;
      })}</ul> : null}
    </fieldset>
    <div className="organization-actions">
      <Button type="submit" variant="primary" busy={saving} disabled={disabled}>Save local person</Button>
      <Button type="button" onClick={onCancel} disabled={saving}>Cancel edit</Button>
    </div>
  </form>;
}
