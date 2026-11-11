import { useState, type FormEvent } from "react";
import type { TeamPerson } from "../../../shared/types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { ErrorBanner } from "../ui/ErrorBanner";
import { createLocalId } from "../../lib/id";
import { useUpdateBlocker } from "../../state/UpdateProvider";

interface TeamPersonEditorProps {
  person: TeamPerson | null;
  onSave: (person: TeamPerson) => Promise<void>;
  onCancel: () => void;
}

function blankPerson(): TeamPerson {
  return {
    id: createLocalId(),
    msxUserId: null,
    name: "",
    email: null,
    title: null,
    role: null,
    manager: null,
    level: null,
    notes: null,
    aliases: [],
    createdAt: new Date().toISOString(),
  };
}

export function TeamPersonEditor({ person, onSave, onCancel }: TeamPersonEditorProps) {
  const [initial] = useState<TeamPerson>(() => person ?? blankPerson());
  const [draft, setDraft] = useState<TeamPerson>(initial);
  useUpdateBlocker(JSON.stringify(draft) !== JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (fields: Partial<TeamPerson>) => setDraft((current) => ({ ...current, ...fields }));

  const addAlias = () =>
    patch({ aliases: [...draft.aliases, { ownerId: null, ownerName: "" }] });
  const updateAlias = (index: number, ownerName: string) =>
    patch({
      aliases: draft.aliases.map((alias, i) => (i === index ? { ...alias, ownerName } : alias)),
    });
  const removeAlias = (index: number) =>
    patch({ aliases: draft.aliases.filter((_, i) => i !== index) });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("A team member needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        aliases: draft.aliases.filter((alias) => alias.ownerName.trim().length > 0),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={person ? `Edit ${person.name}` : "Add a local-only team member"}
      onClose={onCancel}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="team-person-form" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="team-person-form"
        className="team-person-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        {!draft.msxUserId ? (
          <p className="field-hint">
            This person has no linked MSX user record. They are local-only and their
            data is never written back to MSX.
          </p>
        ) : null}
        <div className="scope-editor-grid">
          <TextField
            label="Name"
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
            required
          />
          <TextField
            label="Email"
            type="email"
            value={draft.email ?? ""}
            onChange={(event) => patch({ email: event.target.value || null })}
          />
          <TextField
            label="Title"
            value={draft.title ?? ""}
            onChange={(event) => patch({ title: event.target.value || null })}
          />
          <TextField
            label="Role"
            value={draft.role ?? ""}
            onChange={(event) => patch({ role: event.target.value || null })}
          />
          <TextField
            label="Manager"
            value={draft.manager ?? ""}
            onChange={(event) => patch({ manager: event.target.value || null })}
          />
          <TextField
            label="Level"
            type="number"
            min={1}
            max={100}
            value={draft.level ?? ""}
            onChange={(event) =>
              patch({ level: event.target.value ? Number(event.target.value) : null })
            }
          />
        </div>
        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            className="input"
            rows={3}
            value={draft.notes ?? ""}
            onChange={(event) => patch({ notes: event.target.value || null })}
          />
        </label>

        <fieldset>
          <legend>Owner aliases</legend>
          <p className="field-hint">
            Additional MSX owner display names that should join to this person.
          </p>
          {draft.aliases.map((alias, index) => (
            <div className="custom-status-row" key={index}>
              <TextField
                label="Owner name"
                hideLabel
                value={alias.ownerName}
                onChange={(event) => updateAlias(index, event.target.value)}
              />
              <Button variant="ghost" type="button" onClick={() => removeAlias(index)}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="ghost" type="button" onClick={addAlias}>
            Add alias
          </Button>
        </fieldset>

        {error ? <ErrorBanner message={error} /> : null}
      </form>
    </Modal>
  );
}
