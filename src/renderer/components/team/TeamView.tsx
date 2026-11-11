import { useEffect, useMemo, useState } from "react";
import type { SystemUserSearchResult, TeamPerson } from "../../../shared/types";
import { useLoadedAppData, useAppData } from "../../state/AppDataProvider";
import { useToast } from "../../state/ToastProvider";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { PageHeader } from "../ui/PageHeader";
import { Tabs } from "../ui/Tabs";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { Spinner } from "../ui/Spinner";
import { ErrorBanner } from "../ui/ErrorBanner";
import { EmptyState } from "../ui/EmptyState";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { TeamPersonEditor } from "./TeamPersonEditor";
import { UnmatchedOwnersPanel } from "./UnmatchedOwnersPanel";

type TeamSection = "roster" | "unmatched";

export function TeamView() {
  const { team } = useLoadedAppData();
  const { refreshTeam, refreshPods } = useAppData();
  const { notify } = useToast();

  const [section, setSection] = useState<TeamSection>("roster");
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebouncedValue(term.trim(), 300);
  const [results, setResults] = useState<SystemUserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [editing, setEditing] = useState<TeamPerson | null | "new">(null);
  const [removing, setRemoving] = useState<TeamPerson | null>(null);

  useEffect(() => {
    if (debouncedTerm.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    window.desktop
      .searchUsers(debouncedTerm)
      .then((found) => {
        if (!cancelled) setResults(found);
      })
      .catch((error: unknown) => {
        if (!cancelled) setSearchError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedTerm]);

  const rosterIds = useMemo(() => new Set(team.map((person) => person.msxUserId)), [team]);

  const addFromMsx = async (user: SystemUserSearchResult) => {
    try {
      await window.desktop.addTeamPerson(user);
      notify(`${user.name} added to the roster.`, "positive");
      await refreshTeam();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "critical");
    }
  };

  const savePerson = async (person: TeamPerson) => {
    await window.desktop.saveTeamPerson(person);
    notify(`${person.name} saved.`, "positive");
    await refreshTeam();
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Your roster and how MSX milestone owners map onto it."
        actions={
          <Button variant="secondary" onClick={() => setEditing("new")}>
            Add local-only person
          </Button>
        }
      />

      <Tabs
        ariaLabel="Team sections"
        active={section}
        onChange={setSection}
        tabs={[
          { id: "roster", label: "Roster", badge: team.length },
          { id: "unmatched", label: "Unmatched owners" },
        ]}
      />

      <div className="tab-panel">
        {section === "roster" ? (
          <>
            <div className="team-search">
              <TextField
                label="Find people in MSX"
                hint="Search by name or email, at least 2 characters."
                value={term}
                onChange={(event) => setTerm(event.target.value)}
              />
              {searching ? <Spinner label="Searching..." /> : null}
              {searchError ? <ErrorBanner message={searchError} /> : null}
              {results.length > 0 ? (
                <ul className="search-results">
                  {results.map((user) => {
                    const alreadyAdded = rosterIds.has(user.id);
                    return (
                      <li key={user.id} className="search-result-row">
                        <div>
                          <p className="search-result-name">{user.name}</p>
                          <p className="search-result-meta">
                            {user.email ?? "No email"}
                            {user.title ? ` - ${user.title}` : ""}
                            {user.disabled ? " - Disabled" : ""}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          disabled={alreadyAdded}
                          onClick={() => void addFromMsx(user)}
                        >
                          {alreadyAdded ? "Already added" : "Add"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            {team.length === 0 ? (
              <EmptyState
                title="No team members yet"
                description="Search MSX above or add a local-only person."
              />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Title</th>
                      <th>Role</th>
                      <th>Manager</th>
                      <th>Aliases</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((person) => (
                      <tr key={person.id}>
                        <td>{person.name}</td>
                        <td>{person.email ?? "-"}</td>
                        <td>{person.title ?? "-"}</td>
                        <td>{person.role ?? "-"}</td>
                        <td>{person.manager ?? "-"}</td>
                        <td>{person.aliases.length}</td>
                        <td className="row-actions">
                          <Button variant="ghost" onClick={() => setEditing(person)}>
                            Edit
                          </Button>
                          <Button variant="ghost" onClick={() => setRemoving(person)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <UnmatchedOwnersPanel team={team} onLinked={() => void refreshTeam()} />
        )}
      </div>

      {editing ? (
        <TeamPersonEditor
          person={editing === "new" ? null : editing}
          onSave={savePerson}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Remove ${removing.name}`}
          description={`This removes ${removing.name} from your roster and from any PODs. It never changes MSX.`}
          destructive
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            await window.desktop.removeTeamPerson(removing.id);
            notify(`${removing.name} removed.`, "positive");
            setRemoving(null);
            await refreshTeam();
            await refreshPods();
          }}
        />
      ) : null}
    </div>
  );
}
