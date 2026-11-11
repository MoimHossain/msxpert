import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@fluentui/react-components";
import type { SalesTerritory } from "../../../shared/types";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Spinner } from "../ui/Spinner";
import { useUpdateBlocker } from "../../state/UpdateProvider";

interface TerritoryPickerProps {
  selectedIds: string[];
  onConfirm: (ids: string[]) => Promise<void>;
  onManual?: () => void;
}

export function TerritoryPicker({ selectedIds, onConfirm, onManual }: TerritoryPickerProps) {
  const [territories, setTerritories] = useState<SalesTerritory[]>([]);
  const [selected, setSelected] = useState(new Set(selectedIds));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useUpdateBlocker(busy || selected.size > 0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.desktop.listTerritories().then((items) => {
      if (!cancelled) {
        setTerritories(items);
        setSelected((previous) => new Set([...previous].filter((id) => items.some((item) => item.id === id))));
      }
    }).catch((error: unknown) => {
      if (!cancelled) setError(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);

  const groups = useMemo(() => {
    const result = new Map<string, SalesTerritory[]>();
    const term = search.trim().toLowerCase();
    for (const territory of territories) {
      const group = [territory.salesGroup, territory.salesUnit, territory.accountTeamUnitGroup]
        .map((value) => value ?? "Not specified").join(" / ");
      if (!`${group} ${territory.name}`.toLowerCase().includes(term)) continue;
      result.set(group, [...(result.get(group) ?? []), territory]);
    }
    return [...result.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [territories, search]);

  return <div className="territory-picker">
    <p>Select one or more sales territories visible to your MSX identity. This is the security-trimmed list, not a list of personal assignments.</p>
    <p className="field-hint">Other fiscal-year names are excluded. MSX does not publish active/status or fiscal-year fields here; unversioned records are labelled explicitly.</p>
    <TextField label="Find territories" value={search} onChange={(event) => setSearch(event.target.value)}
      placeholder="Search territory, sales group, sales unit, or account team unit group" />
    {loading ? <Spinner label="Loading accessible territories..." /> : null}
    {error ? <ErrorBanner message={error} onRetry={() => setRetry((current) => current + 1)} /> : null}
    {!loading && !error ? <div className="territory-groups">
      {groups.length === 0 ? <p>No matching territories. Change the search or use manual account lookup.</p> : null}
      {groups.map(([group, items]) => <fieldset key={group}>
        <legend>{group}</legend>
        {items.map((territory) => <Checkbox key={territory.id} disabled={busy}
          checked={selected.has(territory.id)}
          label={`${territory.name} - ${territory.fiscalYear ?? "Unversioned"}; status not published`}
          onChange={(_event, data) => setSelected((current) => {
            const next = new Set(current);
            if (data.checked) next.add(territory.id); else next.delete(territory.id);
            return next;
          })} />)}
      </fieldset>)}
    </div> : null}
    <div className="onboarding-actions">
      <Button variant="primary" busy={busy} disabled={loading || Boolean(error) || selected.size === 0}
        onClick={() => {
          setBusy(true);
          setError(null);
          void onConfirm([...selected]).catch((error: unknown) =>
            setError(error instanceof Error ? error.message : String(error))).finally(() => setBusy(false));
        }}>Continue with {selected.size} territories</Button>
      {onManual ? <Button disabled={busy} onClick={onManual}>Use manual account lookup</Button> : null}
    </div>
  </div>;
}
