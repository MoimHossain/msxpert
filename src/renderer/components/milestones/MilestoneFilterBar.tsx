import { useMemo, useState } from "react";
import { Combobox, Field, Option } from "@fluentui/react-components";
import type { MilestoneRow } from "../../../shared/types";
import { FACET_KEYS, SORT_KEYS, type MilestoneFacet, type MilestoneViewState } from "../../../shared/milestones";
import { deriveFilterOptions, emptyFilters, FACET_LABELS, type FacetOption } from "../../../domain/milestone-view";
import { COLUMN_LABELS } from "../../hooks/useMilestoneColumns";
import { TextField } from "../ui/TextField";
import { SelectField } from "../ui/SelectField";
import { Button } from "../ui/Button";

function FacetPicker({ label, options, selected, onChange }: {
  label: string; options: FacetOption[]; selected: string[]; onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const matching = options.filter(option => query === null || option.label.toLowerCase().includes(query.toLowerCase()));
  const shown = matching.slice(0, 200);
  const first = options.find(option => option.value === selected[0]);
  const summary = first ? `${first.label}${selected.length > 1 ? ` (+${selected.length - 1})` : ""}` : "All";
  return (
    <Field className="field milestone-facet" label={label}>
      <Combobox multiselect selectedOptions={selected} value={query ?? summary} placeholder="Search choices"
        onFocus={() => setQuery("")}
        onChange={event => setQuery(event.target.value)}
        onOpenChange={(_event, data) => setQuery(data.open ? "" : null)}
        onOptionSelect={(_event, data) => onChange(data.selectedOptions)}
        title={options.filter(option => selected.includes(option.value)).map(option => option.label).join(", ") || summary}>
        {shown.map(option => <Option key={option.value} value={option.value} text={option.label}>
          {option.label} ({option.count})
        </Option>)}
        {matching.length > shown.length ? <Option disabled value="__more__" text="Type to search all choices">Type to search all {matching.length} choices</Option> : null}
        {!matching.length ? <Option disabled value="__empty__">No matching choices</Option> : null}
      </Combobox>
    </Field>
  );
}

export function MilestoneFilterBar({ milestones, value, onChange }: {
  milestones: MilestoneRow[]; value: MilestoneViewState; onChange: (value: MilestoneViewState) => void;
}) {
  const options = useMemo(() => deriveFilterOptions(milestones, value.filters), [milestones, value.filters]);
  const filters = value.filters;
  const update = (patch: Partial<typeof filters>) => onChange({ ...value, filters: { ...filters, ...patch } });
  const changeGroup = (index: number, key: string) => {
    const group = FACET_KEYS.find(field => field === key);
    const next: MilestoneFacet[] = [...value.groupBy];
    if (group) next.splice(index, 1, group);
    else next.splice(index);
    onChange({ ...value, groupBy: next });
  };
  return (
    <section className="milestone-explorer-controls" aria-label="Milestone exploration">
      <div className="milestone-filters">
        <TextField className="milestone-search" label="Search milestones" type="search" maxLength={4000}
          placeholder="Name, number, owner, raised by, account, opportunity, comments..."
          value={filters.search} onChange={event => update({ search: event.target.value })} />
        {FACET_KEYS.map(key => <FacetPicker key={key} label={FACET_LABELS[key]} options={options[key]} selected={filters[key]}
          onChange={selected => update({ [key]: selected })} />)}
        <TextField label="Date from" type="date" value={filters.dateFrom} onChange={event => update({ dateFrom: event.target.value })} />
        <TextField label="Date to" type="date" value={filters.dateTo} onChange={event => update({ dateTo: event.target.value })} />
        <TextField label="Minimum monthly use" inputMode="decimal" maxLength={100} value={filters.minMonthlyUse}
          onChange={event => update({ minMonthlyUse: event.target.value })} />
        <TextField label="Maximum monthly use" inputMode="decimal" maxLength={100} value={filters.maxMonthlyUse}
          onChange={event => update({ maxMonthlyUse: event.target.value })} />
        <Button variant="ghost" onClick={() => onChange({ ...value, filters: emptyFilters() })}>Clear filters</Button>
      </div>
      <div className="milestone-shaping">
        {[0, 1, 2].filter(index => index <= value.groupBy.length).map(index =>
          <SelectField key={index} label={index ? `Then group by ${index + 1}` : "Group by"} value={value.groupBy[index] ?? ""}
            onChange={event => changeGroup(index, event.target.value)}>
            <option value="">No grouping</option>
            {FACET_KEYS.filter(key => !value.groupBy.includes(key) || value.groupBy[index] === key)
              .map(key => <option key={key} value={key}>{FACET_LABELS[key]}</option>)}
          </SelectField>)}
        <SelectField label="Order by" value={value.sortKey}
          onChange={event => {
            const sortKey = SORT_KEYS.find(key => key === event.target.value);
            if (sortKey) onChange({ ...value, sortKey });
          }}>
          {SORT_KEYS.map(key => <option key={key} value={key}>{COLUMN_LABELS[key]}</option>)}
        </SelectField>
        <SelectField label="Sort direction" value={value.sortDirection}
          onChange={event => onChange({ ...value, sortDirection: event.target.value === "desc" ? "desc" : "asc" })}>
          <option value="asc">Ascending</option><option value="desc">Descending</option>
        </SelectField>
      </div>
    </section>
  );
}
