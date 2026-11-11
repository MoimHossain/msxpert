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
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [unavailable, setUnavailable] = useState(0);
  useUpdateBlocker(busy || selected.size > 0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.desktop.listTerritories().then((items) => {
      if (!cancelled) {
        setTerritories(items);
        const available = new Set(items.map((item) => item.id));
        setUnavailable(selectedIds.filter((id) => !available.has(id)).length);
        setSelected((previous) => new Set([...previous].filter((id) => available.has(id))));
      }
    }).catch((error: unknown) => {
      if (!cancelled) setError(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);

  const { groups, matchCount } = useMemo(() => {
    const result = new Map<string, SalesTerritory[]>();
    const term = search.trim().toLowerCase();
    const matching = territories.filter((territory) =>
      (!selectedOnly || selected.has(territory.id)) &&
      [territory.name, territory.salesGroup, territory.salesUnit, territory.accountTeamUnitGroup]
        .join(" ").toLowerCase().includes(term));
    for (const territory of matching.slice(0, 200)) {
      const group = [territory.salesGroup, territory.salesUnit, territory.accountTeamUnitGroup]
        .map((value) => value ?? "Not specified").join(" / ");
      result.set(group, [...(result.get(group) ?? []), territory]);
    }
    return { groups: [...result.entries()].sort(([left], [right]) => left.localeCompare(right)), matchCount: matching.length };
  }, [territories, search, selectedOnly, selected]);

  return <div className="territory-picker">
    <p>Select one or more sales territories visible to your MSX identity. This is the security-trimmed list, not a list of personal assignments.</p>
    <p className="field-hint">Other fiscal-year names are excluded. MSX does not publish active/status or fiscal-year fields here; unversioned records are labelled explicitly.</p>
    <TextField label="Find territories" value={search} onChange={(event) => setSearch(event.target.value)}
      placeholder="Search territory, sales group, sales unit, or account team unit group" />
    <Checkbox label="Show selected only" checked={selectedOnly} onChange={(_event, data) => setSelectedOnly(Boolean(data.checked))} />
    {unavailable > 0 ? <p role="status">{unavailable} saved selections are no longer available for this fiscal year and were deselected.</p> : null}
    {!loading && !error ? <p className="field-hint">Showing {Math.min(200, matchCount)} of {matchCount} matches.
      {matchCount > 200 ? " Refine the search to find other territories; selections are kept across searches." : ""}</p> : null}
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
        }}>Continue with {selected.size} {selected.size === 1 ? "territory" : "territories"}</Button>
      {onManual ? <Button disabled={busy} onClick={onManual}>Use manual account lookup</Button> : null}
    </div>
  </div>;
}
