import { useState } from "react";
import type { OrgProgress } from "../../../shared/organization";
import { useOrganization } from "../../state/OrganizationProvider";
import { SidePanel } from "../ui/SidePanel";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Spinner } from "../ui/Spinner";

const stages: Record<OrgProgress["stage"], string> = {
  identity: "Looking up the signed-in MSX user's profile",
  resolving: "Resolving creator and owner identities from saved milestones",
  profiles: "Checking milestone people's exact profiles and job titles",
  climbing: "Climbing the manager chain to a CVP/country head",
  descending: "Exploring reports within the boundary",
  linking: "Linking exact work identities to MSX users",
  finished: "Finishing discovery",
};
const finishedStages: Record<Exclude<OrgProgress["status"], "running">, string> = {
  complete: "Discovery finished",
  partial: "Finished with partial coverage",
  failed: "Discovery failed",
  cancelled: "Discovery stopped",
};
const outcomes: Record<OrgProgress["status"], string> = {
  running: "Running", complete: "Finished · best-effort", partial: "Partial results", failed: "Failed", cancelled: "Stopped",
};

export function OrganizationProgressPanel({ onClose }: { onClose: () => void }) {
  const { state, error, busy, cancel } = useOrganization();
  const [stopping, setStopping] = useState(false);
  const progress = state?.progress;
  const milestoneMode = progress?.mode === "milestones";
  const emptyPartial = progress?.status === "partial" && progress.saved === 0 && progress.matched === 0;
  const root = progress ? progress.root : state?.root;
  return <SidePanel title="Organization discovery" onClose={onClose}>
    <div className="organization-drawer organization-progress">
      <p className="field-hint">Closing this drawer does not stop discovery. Reopen it from any page.
        Work IQ answers can omit people; saved results do not prove complete coverage.</p>
      {progress ? <p className="field-hint">{milestoneMode
        ? "Milestone people only: no manager, CVP or report traversal."
        : "Experimental hierarchy exploration; entire branches may be unavailable."}</p> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {!progress ? busy ? <Spinner label="Starting organization discovery..." /> : <p>No discovery has run yet.</p> : <>
        <div className="organization-actions" role="status" aria-live="polite">
          <Badge tone={progress.running ? "info" : progress.status === "failed" ? "critical" : progress.status === "complete" ? "positive" : "warning"}>
            {emptyPartial ? "No usable profiles saved" : outcomes[progress.status]}
          </Badge>
          <span>{progress.status === "running" ? stages[progress.stage] : finishedStages[progress.status]}</span>
        </div>
        {progress.running ? <Spinner label={progress.currentPerson ? `Working on ${progress.currentPerson}` : "Waiting for Work IQ..."} /> : null}
        {!progress.running && progress.currentPerson ? <p>Last person: {progress.currentPerson}</p> : null}
        {!milestoneMode ? <section className="organization-boundary">
          <h3>CVP/country head boundary</h3>
          {root ? <><strong>{root.name}</strong><p>{root.jobTitle}</p><p>{root.upn}</p></> :
            <p>{progress.running ? "Resolving the nearest qualifying boundary..." : "No qualifying boundary was established."}</p>}
        </section> : null}
        <dl className="organization-counts" aria-label="Reported discovery counts">
          {[["Visited", progress.visited], ["Queued", progress.queued], ["Matched", progress.matched],
            ["Saved", progress.saved], ["Requests", progress.requests]].map(([label, count]) =>
            <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
        </dl>
        <p className="field-hint">{milestoneMode
          ? `${progress.visited + progress.queued} resolved milestone people targeted. Unresolvable MSX identities are not included.`
          : "No total population is known."} Saved counts reflect this run; {state?.people.length ?? 0} records are currently cached.
          {" "}Started {new Date(progress.startedAt).toLocaleString()}{progress.finishedAt ? ` · Ended ${new Date(progress.finishedAt).toLocaleString()}` : ""}.</p>
        {progress.error ? <ErrorBanner message={progress.error} /> : null}
        {state?.linkError ? <ErrorBanner message={`MSX identity linking: ${state.linkError}`} /> : null}
        {progress.status === "partial" ? <p className="callout">{emptyPartial
          ? "This run saved no usable profiles. Review the rejection reasons below; earlier cached records and manual corrections are kept."
          : "Discovery ended with partial coverage. Review the warnings below; previously saved and manually corrected records are kept."}</p> : null}
        {progress.status === "cancelled" ? <p className="callout">Further discovery requests were stopped. Accepted records saved before stopping are kept.</p> : null}
        {progress.warnings.length ? <section><h3>Warnings and rejected / partial results</h3>
          <ul className="organization-warning-list">{progress.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </section> : null}
        <section><h3>Activity log</h3>
          {progress.logs.length ? <ol className="organization-log" aria-label="Discovery activity">
            {progress.logs.map((log, index) => <li key={index}><time dateTime={log.at}>{new Date(log.at).toLocaleTimeString()}</time><span>{log.message}</span></li>)}
          </ol> : <p className="field-hint">Waiting for activity from the discovery service.</p>}
        </section>
      </>}
      <div className="organization-drawer-footer">
        {progress?.running ? <Button variant="danger" disabled={stopping} onClick={() => {
          setStopping(true);
          void cancel().catch(() => undefined).finally(() => setStopping(false));
        }}>{stopping ? "Stopping discovery..." : "Stop discovery"}</Button> : null}
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  </SidePanel>;
}
