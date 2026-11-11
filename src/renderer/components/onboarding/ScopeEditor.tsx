import { useState, type FormEvent } from "react";
import type { ScopeSettings } from "../../../shared/types";
import { DEFAULT_EXCLUDED_STATUSES, microsoftFiscalYear } from "../../../domain/defaults";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";

interface ScopeEditorProps {
  value: ScopeSettings;
  onSave: (scope: ScopeSettings) => Promise<void> | void;
  busy?: boolean;
  saveLabel?: string;
}

interface CustomStatus {
  value: number;
  label: string;
}

function toCustomStatuses(scope: ScopeSettings): CustomStatus[] {
  const knownLabels = new Set<string>(
    DEFAULT_EXCLUDED_STATUSES.map((status) => status.label),
  );
  return scope.excludedStatusValues
    .map((value, index) => ({ value, label: scope.excludedStatusLabels[index] ?? "" }))
    .filter((status) => !knownLabels.has(status.label));
}

export function ScopeEditor({
  value,
  onSave,
  busy = false,
  saveLabel = "Save scope",
}: ScopeEditorProps) {
  const [label, setLabel] = useState(value.label);
  const [dateFrom, setDateFrom] = useState(value.dateFrom);
  const [dateTo, setDateTo] = useState(value.dateTo);
  const [knownExcluded, setKnownExcluded] = useState<Set<string>>(
    new Set(value.excludedStatusLabels),
  );
  const [custom, setCustom] = useState<CustomStatus[]>(() => toCustomStatuses(value));
  const [showCustom, setShowCustom] = useState(custom.length > 0);
  const [error, setError] = useState<string | null>(null);

  const toggleKnown = (statusLabel: string) => {
    setKnownExcluded((current) => {
      const next = new Set(current);
      if (next.has(statusLabel)) next.delete(statusLabel);
      else next.add(statusLabel);
      return next;
    });
  };

  const applyFiscalYearDefault = () => {
    const fiscal = microsoftFiscalYear();
    setLabel(fiscal.label);
    setDateFrom(fiscal.dateFrom);
    setDateTo(fiscal.dateTo);
  };

  const addCustomStatus = () => {
    setCustom((current) => [...current, { value: 0, label: "" }]);
  };

  const updateCustomStatus = (index: number, patch: Partial<CustomStatus>) => {
    setCustom((current) =>
      current.map((status, i) => (i === index ? { ...status, ...patch } : status)),
    );
  };

  const removeCustomStatus = (index: number) => {
    setCustom((current) => current.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError("Give this scope a short label, such as FY26.");
      return;
    }
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      setError("The start date must be on or before the end date.");
      return;
    }
    const knownStatuses = DEFAULT_EXCLUDED_STATUSES.filter((status) =>
      knownExcluded.has(status.label),
    );
    const validCustom = custom.filter((status) => status.label.trim().length > 0);
    const scope: ScopeSettings = {
      label: label.trim(),
      dateFrom,
      dateTo,
      excludedStatusValues: [
        ...knownStatuses.map((status) => status.value),
        ...validCustom.map((status) => status.value),
      ],
      excludedStatusLabels: [
        ...knownStatuses.map((status) => status.label),
        ...validCustom.map((status) => status.label.trim()),
      ],
    };
    await onSave(scope);
  };

  return (
    <form className="scope-editor" onSubmit={(event) => void handleSubmit(event)}>
      <div className="scope-editor-grid">
        <TextField
          label="Window label"
          hint="A short name shown throughout the app, e.g. FY26."
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={100}
          required
        />
        <TextField
          label="From"
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          required
        />
        <TextField
          label="To"
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          required
        />
      </div>
      <Button variant="ghost" type="button" onClick={applyFiscalYearDefault}>
        Use current Microsoft fiscal year
      </Button>

      <fieldset className="scope-statuses">
        <legend>Excluded statuses</legend>
        <p className="field-hint">
          Milestones with these statuses are left out of every fetch and dashboard.
        </p>
        {DEFAULT_EXCLUDED_STATUSES.map((status) => (
          <label key={status.label} className="checkbox-row">
            <input
              type="checkbox"
              checked={knownExcluded.has(status.label)}
              onChange={() => toggleKnown(status.label)}
            />
            {status.label}
          </label>
        ))}

        <button
          type="button"
          className="link-button"
          onClick={() => setShowCustom((current) => !current)}
        >
          {showCustom ? "Hide" : "Add"} custom excluded status
        </button>
        {showCustom ? (
          <div className="custom-statuses">
            {custom.map((status, index) => (
              <div className="custom-status-row" key={index}>
                <TextField
                  label="Status value"
                  hideLabel
                  type="number"
                  value={status.value}
                  onChange={(event) =>
                    updateCustomStatus(index, { value: Number(event.target.value) })
                  }
                />
                <TextField
                  label="Status label"
                  hideLabel
                  placeholder="Status label"
                  value={status.label}
                  onChange={(event) => updateCustomStatus(index, { label: event.target.value })}
                />
                <Button variant="ghost" onClick={() => removeCustomStatus(index)}>
                  Remove
                </Button>
              </div>
            ))}
            <Button variant="ghost" type="button" onClick={addCustomStatus}>
              Add another status
            </Button>
          </div>
        ) : null}
      </fieldset>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" busy={busy}>
        {saveLabel}
      </Button>
    </form>
  );
}
