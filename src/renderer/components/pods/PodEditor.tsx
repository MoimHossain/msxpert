import { useState, type FormEvent } from "react";
import type { AccountOverview, Pod, PodPersonAssignment, PodRole, TeamPerson } from "../../../shared/types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { SelectField } from "../ui/SelectField";
import { ErrorBanner } from "../ui/ErrorBanner";
import { useUpdateBlocker } from "../../state/UpdateProvider";

const ROLES: PodRole[] = ["CSAM", "Durable CSA", "CAIP CSA"];

interface PodEditorProps {
  pod: Pod | null;
  accounts: AccountOverview[];
  team: TeamPerson[];
  onSave: (pod: Pod) => Promise<void>;
  onCancel: () => void;
}

function blankPod(): Pod {
  return {
    id: "",
    name: "",
    notes: null,
    accountIds: [],
    people: [],
    createdAt: "",
    updatedAt: "",
  };
}

export function PodEditor({ pod, accounts, team, onSave, onCancel }: PodEditorProps) {
  const [initial] = useState<Pod>(() => pod ?? blankPod());
  const [draft, setDraft] = useState<Pod>(initial);
  useUpdateBlocker(JSON.stringify(draft) !== JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (fields: Partial<Pod>) => setDraft((current) => ({ ...current, ...fields }));

  const toggleAccount = (accountId: string) => {
    patch({
      accountIds: draft.accountIds.includes(accountId)
        ? draft.accountIds.filter((id) => id !== accountId)
        : [...draft.accountIds, accountId],
    });
  };

  const togglePerson = (personId: string) => {
    const assigned = draft.people.some((assignment) => assignment.personId === personId);
    patch({
      people: assigned
        ? draft.people.filter((assignment) => assignment.personId !== personId)
        : [
            ...draft.people,
            {
              personId,
              role: "CSAM",
              percentage: null,
              notes: null,
            },
          ],
    });
  };

  const updateAssignment = (index: number, fields: Partial<PodPersonAssignment>) => {
    patch({
      people: draft.people.map((assignment, i) =>
        i === index ? { ...assignment, ...fields } : assignment,
      ),
    });
  };

  const removeAssignment = (index: number) => {
    patch({ people: draft.people.filter((_, i) => i !== index) });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("A POD needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, name: draft.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={pod ? `Edit ${pod.name}` : "Create a POD"}
      onClose={onCancel}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="pod-editor-form" busy={busy}>
            Save POD
          </Button>
        </>
      }
    >
      <form id="pod-editor-form" onSubmit={(event) => void handleSubmit(event)}>
        <TextField
          label="POD name"
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          required
        />
        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            className="input"
            rows={2}
            value={draft.notes ?? ""}
            onChange={(event) => patch({ notes: event.target.value || null })}
          />
        </label>

        <fieldset>
          <legend>Accounts</legend>
          {accounts.length === 0 ? (
            <p className="field-hint">No tracked accounts yet.</p>
          ) : (
            <div className="checkbox-grid">
              {accounts.map((account) => (
                <label key={account.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.accountIds.includes(account.id)}
                    onChange={() => toggleAccount(account.id)}
                  />
                  {account.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>People</legend>
          {team.length === 0 ? (
            <p className="field-hint">Add roster members from the Team page first.</p>
          ) : (
            <>
              <p className="field-hint">
                Select people to add them to this POD. Clear a selection or use Remove
                to remove them.
              </p>
              <div className="pod-people-picker">
                {team.map((person) => (
                  <label key={person.id} className="pod-person-option">
                    <input
                      type="checkbox"
                      checked={draft.people.some(
                        (assignment) => assignment.personId === person.id,
                      )}
                      onChange={() => togglePerson(person.id)}
                    />
                    <span>
                      <strong>{person.name}</strong>
                      {person.role || person.title ? (
                        <small>{person.role ?? person.title}</small>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              {draft.people.map((assignment, index) => (
                <div className="pod-assignment-row" key={assignment.personId}>
                  <div className="pod-assignment-person">
                    {team.find((person) => person.id === assignment.personId)?.name ??
                      "Unknown person"}
                  </div>
                  <SelectField
                    label="Role"
                    hideLabel
                    value={assignment.role}
                    onChange={(event) =>
                      updateAssignment(index, { role: event.target.value as PodRole })
                    }
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Coverage %"
                    hideLabel
                    type="number"
                    min={0}
                    max={100}
                    placeholder="%"
                    value={assignment.percentage ?? ""}
                    onChange={(event) =>
                      updateAssignment(index, {
                        percentage: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                  <TextField
                    label="Notes"
                    hideLabel
                    placeholder="Notes"
                    value={assignment.notes ?? ""}
                    onChange={(event) =>
                      updateAssignment(index, { notes: event.target.value || null })
                    }
                  />
                  <Button variant="ghost" type="button" onClick={() => removeAssignment(index)}>
                    Remove
                  </Button>
                </div>
              ))}
            </>
          )}
        </fieldset>

        {error ? <ErrorBanner message={error} /> : null}
      </form>
    </Modal>
  );
}
