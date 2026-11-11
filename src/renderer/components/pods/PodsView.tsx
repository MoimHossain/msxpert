import { useMemo, useState } from "react";
import type { Pod, PodSummary } from "../../../shared/types";
import { useLoadedAppData, useAppData } from "../../state/AppDataProvider";
import { useToast } from "../../state/ToastProvider";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PodEditor } from "./PodEditor";
import { formatCurrency, formatNumber } from "../../lib/format";
import { computePodDiagnostics } from "../../lib/podDiagnostics";

export function PodsView() {
  const { overview, team, pods } = useLoadedAppData();
  const { refreshPods } = useAppData();
  const { notify } = useToast();

  const [editing, setEditing] = useState<Pod | null | "new">(null);
  const [removing, setRemoving] = useState<PodSummary | null>(null);

  const diagnostics = useMemo(
    () => computePodDiagnostics(overview.accounts, pods, team),
    [overview.accounts, pods, team],
  );

  const savePod = async (pod: Pod) => {
    await window.desktop.savePod(pod);
    notify(`${pod.name} saved.`, "positive");
    await refreshPods();
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="PODs"
        subtitle="Coverage, roles, and health rollups for each POD."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            Create POD
          </Button>
        }
      />

      {(diagnostics.uncoveredAccounts.length > 0 ||
        diagnostics.duplicatedAccounts.length > 0 ||
        diagnostics.unassignedPeople.length > 0) && (
        <div className="callout callout-warning">
          <h3>Coverage diagnostics</h3>
          {diagnostics.uncoveredAccounts.length > 0 ? (
            <p>
              {diagnostics.uncoveredAccounts.length} account(s) not assigned to any POD:{" "}
              {diagnostics.uncoveredAccounts.map((account) => account.name).join(", ")}
            </p>
          ) : null}
          {diagnostics.duplicatedAccounts.length > 0 ? (
            <p>
              {diagnostics.duplicatedAccounts.length} account(s) assigned to multiple PODs:{" "}
              {diagnostics.duplicatedAccounts
                .map((item) => `${item.account.name} (${item.podNames.join(", ")})`)
                .join("; ")}
            </p>
          ) : null}
          {diagnostics.unassignedPeople.length > 0 ? (
            <p>
              {diagnostics.unassignedPeople.length} roster member(s) with no POD assignment:{" "}
              {diagnostics.unassignedPeople.map((person) => person.name).join(", ")}
            </p>
          ) : null}
        </div>
      )}

      {pods.length === 0 ? (
        <EmptyState
          title="No PODs yet"
          description="Create a POD to organize account coverage and roles."
          action={
            <Button variant="primary" onClick={() => setEditing("new")}>
              Create your first POD
            </Button>
          }
        />
      ) : (
        <div className="pod-grid">
          {pods.map((pod) => (
            <article key={pod.id} className="pod-card">
              <div className="account-card-header">
                <h3>{pod.name}</h3>
              </div>
              {pod.notes ? <p className="field-hint">{pod.notes}</p> : null}

              <p className="pod-accounts">
                <strong>Accounts:</strong> {pod.accountNames.join(", ") || "None assigned"}
              </p>

              <ul className="pod-people-list">
                {pod.peopleNames.length === 0 ? (
                  <li className="field-hint">No people assigned.</li>
                ) : (
                  pod.peopleNames.map((entry, index) => (
                    <li key={`${entry.name}-${index}`}>
                      {entry.name} <Badge tone="neutral">{entry.role}</Badge>
                    </li>
                  ))
                )}
              </ul>

              <div className="account-card-stats">
                <div>
                  <p className="stat-label">Milestones</p>
                  <p className="stat-value">{formatNumber(pod.milestones)}</p>
                </div>
                <div>
                  <p className="stat-label">On track</p>
                  <p className="stat-value">{formatNumber(pod.onTrack)}</p>
                </div>
                <div>
                  <p className="stat-label">At risk</p>
                  <p className="stat-value">{formatNumber(pod.atRisk)}</p>
                </div>
                <div>
                  <p className="stat-label">Blocked</p>
                  <p className="stat-value">{formatNumber(pod.blocked)}</p>
                </div>
                <div>
                  <p className="stat-label">Monthly use</p>
                  <p className="stat-value">{formatCurrency(pod.monthlyUse)}</p>
                </div>
                <div>
                  <p className="stat-label">Owners</p>
                  <p className="stat-value">{formatNumber(pod.owners)}</p>
                </div>
              </div>

              <div className="account-card-actions">
                <Button variant="ghost" onClick={() => setEditing(pod)}>
                  Edit POD / people
                </Button>
                <Button variant="ghost" onClick={() => setRemoving(pod)}>
                  Remove
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing ? (
        <PodEditor
          pod={editing === "new" ? null : editing}
          accounts={overview.accounts}
          team={team}
          onSave={savePod}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Remove ${removing.name}`}
          description="This removes the POD and its assignments. Accounts, people, and MSX data are unaffected."
          destructive
          confirmLabel="Remove POD"
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            await window.desktop.removePod(removing.id);
            notify(`${removing.name} removed.`, "positive");
            setRemoving(null);
            await refreshPods();
          }}
        />
      ) : null}
    </div>
  );
}
