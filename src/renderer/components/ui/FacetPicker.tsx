import { useState } from "react";
import { Combobox, Field, Option } from "@fluentui/react-components";

export function FacetPicker({ label, options, selected, onChange }: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const matching = options.filter(option => query === null || option.label.toLowerCase().includes(query.toLowerCase()));
  const shown = matching.slice(0, 200);
  const first = options.find(option => option.value === selected[0]);
  const summary = first ? `${first.label}${selected.length > 1 ? ` (+${selected.length - 1})` : ""}` : "All";
  return <Field className="field milestone-facet" label={label}>
    <Combobox multiselect selectedOptions={selected} value={query ?? summary} placeholder="Search choices"
      onFocus={() => setQuery("")} onChange={event => setQuery(event.target.value)}
      onOpenChange={(_event, data) => setQuery(data.open ? "" : null)}
      onOptionSelect={(_event, data) => onChange(data.selectedOptions)}
      title={options.filter(option => selected.includes(option.value)).map(option => option.label).join(", ") || summary}>
      {shown.map(option => <Option key={option.value} value={option.value} text={option.label}>
        {option.label}{option.count === undefined ? "" : ` (${option.count})`}
      </Option>)}
      {matching.length > shown.length ? <Option disabled value="__more__" text="Type to search all choices">
        Type to search all {matching.length} choices</Option> : null}
      {!matching.length ? <Option disabled value="__empty__">No matching choices</Option> : null}
    </Combobox>
  </Field>;
}
