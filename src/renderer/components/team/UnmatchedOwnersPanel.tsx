import { useState } from "react";
import type { AccountState, TeamPerson } from "../../../shared/types";
import { useLoadedAppData } from "../../state/AppDataProvider";
import { useToast } from "../../state/ToastProvider";
import { Button } from "../ui/Button";
import { SelectField } from "../ui/SelectField";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";
import { ErrorBanner } from "../ui/ErrorBanner";
import { formatNumber } from "../../lib/format";
import { createLocalId } from "../../lib/id";
import { unmatchedOwners, type OwnerSighting } from "../../lib/unmatchedOwners";

interface UnmatchedOwnersPanelProps {
  team: TeamPerson[];
  onLinked: () => void;
}

export function UnmatchedOwnersPanel({ team, onLinked }: UnmatchedOwnersPanelProps) {
  const { overview } = useLoadedAppData();
  const { notify } = useToast();
  const [scanned, setScanned] = useState<OwnerSighting[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const states: AccountState[] = await Promise.all(
        overview.accounts.map((account) => window.desktop.getAccountState(account.id)),
      );
      setScanned(unmatchedOwners(states, team));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const ownerKey = (owner: OwnerSighting) => owner.ownerId ?? `name:${owner.ownerName}`;

  const addAsNew = async (owner: OwnerSighting) => {
    const person: TeamPerson = {
      id: createLocalId(),
      msxUserId: owner.ownerId,
      name: owner.ownerName,
      email: null,
      title: null,
      role: null,
      manager: null,
      level: null,
      notes: null,
      aliases: [],
      createdAt: new Date().toISOString(),
    };
    try {
      await window.desktop.saveTeamPerson(person);
      notify(`${owner.ownerName} added to the roster.`, "positive");
      setScanned((current) => current?.filter((item) => item !== owner) ?? null);
      onLinked();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "critical");
    }
  };

  const linkToExisting = async (owner: OwnerSighting) => {
    const targetId = linkChoice[ownerKey(owner)];
    const target = team.find((person) => person.id === targetId);
    if (!target) return;
    const alreadyLinked = target.aliases.some(
      (alias) => alias.ownerId === owner.ownerId && alias.ownerName === owner.ownerName,
    );
    if (alreadyLinked) return;
    try {
      await window.desktop.saveTeamPerson({
        ...target,
        aliases: [...target.aliases, { ownerId: owner.ownerId, ownerName: owner.ownerName }],
      });
      notify(`Linked ${owner.ownerName} to ${target.name}.`, "positive");
      setScanned((current) => current?.filter((item) => item !== owner) ?? null);
      onLinked();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "critical");
    }
  };

  return (
    <div>
      <div className="changes-toolbar">
        <p className="field-hint">
          Finds milestone owners across your portfolio who are not yet linked to a
          roster person, either directly or through an alias.
        </p>
        <Button variant="secondary" busy={loading} onClick={() => void runScan()}>
          Scan portfolio
        </Button>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void runScan()} /> : null}

      {loading ? (
        <Spinner label="Scanning milestone owners..." />
      ) : scanned == null ? (
        <EmptyState
          title="Not scanned yet"
          description="Select Scan portfolio to compare current milestone owners against your roster."
        />
      ) : scanned.length === 0 ? (
        <EmptyState
          title="Every current owner is matched"
          description="All milestone owners in your portfolio map to a roster person."
        />
      ) : (
        <ul className="unmatched-owner-list">
          {scanned.map((owner) => (
            <li key={ownerKey(owner)} className="unmatched-owner-row">
              <div>
                <p className="search-result-name">{owner.ownerName}</p>
                <p className="search-result-meta">
                  {formatNumber(owner.count)} milestone(s) across{" "}
                  {[...owner.accountNames].join(", ") || "unknown accounts"}
                </p>
              </div>
              <div className="unmatched-owner-actions">
                <SelectField
                  label={`Link ${owner.ownerName} to`}
                  hideLabel
                  value={linkChoice[ownerKey(owner)] ?? ""}
                  onChange={(event) =>
                    setLinkChoice((current) => ({
                      ...current,
                      [ownerKey(owner)]: event.target.value,
                    }))
                  }
                >
                  <option value="">Link to existing person...</option>
                  {team.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </SelectField>
                <Button
                  variant="ghost"
                  disabled={!linkChoice[ownerKey(owner)]}
                  onClick={() => void linkToExisting(owner)}
                >
                  Link
                </Button>
                <Button variant="secondary" onClick={() => void addAsNew(owner)}>
                  Add to roster
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
