import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkle24Regular, ArrowRight24Regular } from "@fluentui/react-icons";
import { HYGIENE_RULES, type HygieneRow, type HygieneRule, type HygieneScope, type HygieneSnapshot, type MonthlyPipeline } from "../../../shared/hygiene";
import { businessDateAfter, evaluateHygiene, localBusinessDate, mappedOpportunityStage, monthlyPipeline, priorityRows, selectHygieneScope } from "../../../domain/hygiene";
import { useLoadedAppData } from "../../state/AppDataProvider";
import { useNavigation } from "../../state/NavigationProvider";
import { useOrganization } from "../../state/OrganizationProvider";
import { useFetch } from "../../state/FetchProvider";
import { useToast } from "../../state/ToastProvider";
import { Button } from "../ui/Button";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Spinner } from "../ui/Spinner";
import { SelectField } from "../ui/SelectField";
import { MsxLink } from "../ui/MsxLink";
import type { MilestoneRow } from "../../../shared/types";

const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
function PipelineValue({ value }: { value: MonthlyPipeline }) {
  return <div className="hygiene-value">
    {value.totals.map(total => <span key={total.currency}>{total.currency} {number(total.value)} / month</span>)}
    {!value.totals.length ? <span>Monthly value unavailable</span> : null}
    {value.missingCurrency ? <small>{value.missingCurrency} value(s): currency not cached</small> : null}
    {value.missingValue ? <small>{value.missingValue} missing monthly value(s)</small> : null}
  </div>;
}

function accountKey(row: MilestoneRow) { return row.accountId || `portfolio:${row.portfolioAccountId}`; }
function ownerKey(row: MilestoneRow) { return row.ownerId?.toLowerCase() || "(missing)"; }

export function OverviewView() {
  const { profile, auth, settings } = useLoadedAppData();
  const { navigate } = useNavigation();
  const { state: organization, openManage } = useOrganization();
  const { fetchAccounts, busy: fetching, progress } = useFetch();
  const { notify } = useToast();
  const [snapshot, setSnapshot] = useState<HygieneSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<HygieneScope>("watched");
  const [selected, setSelected] = useState<HygieneRule | "priority">("priority");
  const [result, setResult] = useState<"flagged" | "unknown">("flagged");
  const [owner, setOwner] = useState("");
  const [account, setAccount] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [limit, setLimit] = useState(50);
  const requests = useRef(0);
  const list = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    const request = ++requests.current;
    setLoading(true); setError(null);
    try {
      const next = await window.desktop.getHygieneSnapshot();
      if (request === requests.current) setSnapshot(next);
    } catch (reason) {
      if (request === requests.current) {
        setSnapshot(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally { if (request === requests.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    return () => { ++requests.current; };
  }, [load, auth.username, profile?.id, settings.scope, organization?.revision, progress?.completed]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = localBusinessDate(now);
  const scoped = useMemo(() => snapshot ? selectHygieneScope(snapshot, scope) : [], [snapshot, scope]);
  const rows = useMemo(() => evaluateHygiene(scoped, now), [scoped, now]);
  const priorities = useMemo(() => priorityRows(rows), [rows]);
  const coaching = rows.filter(row => row.checks.some(check => check.rule === "coaching" && check.result === "flagged"));
  const scopeUnavailable = scope === "mine" && !snapshot?.currentUserId;
  const selectedCheck = (row: HygieneRow) => row.checks.some(check =>
    (selected === "priority" ? check.rule !== "coaching" : check.rule === selected) && check.result === result);
  const filtered = rows.filter(row => selectedCheck(row) && (!owner || ownerKey(row.milestone) === owner) &&
    (!account || accountKey(row.milestone) === account))
    .sort((a, b) => (a.milestone.date ?? "9999").localeCompare(b.milestone.date ?? "9999") || a.milestone.id.localeCompare(b.milestone.id));
  const owners = [...new Map(rows.map(row => [ownerKey(row.milestone), row.milestone.ownerName || row.milestone.ownerId || "No owner"])).entries()];
  const accounts = [...new Map(rows.map(row => [accountKey(row.milestone), row.milestone.accountName || row.milestone.portfolioAccountName])).entries()];
  const sourceAccounts = new Set(scoped.map(row => row.portfolioAccountId));
  const captures = snapshot?.captures.filter(capture => scope === "mine" || capture.watched || sourceAccounts.has(capture.accountId)) ?? [];
  const times = captures.flatMap(capture => capture.refreshedAt ? [capture.refreshedAt] : []).sort();
  const hasCapture = captures.some(capture => capture.hasData);
  const unknownCount = rows.filter(row => row.checks.some(check => check.rule !== "coaching" && check.result === "unknown")).length;
  const choose = (id: HygieneRule | "priority", view: "flagged" | "unknown" = "flagged") => {
    setSelected(id); setResult(view); setLimit(50);
    list.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  const refresh = async () => {
    try {
      const refreshed = await fetchAccounts();
      const failed = refreshed.accounts.filter(entry => !entry.ok).length;
      notify(failed ? `${failed} account refresh(es) failed. Review fetch progress.` : "Watched account cache refreshed.", failed ? "warning" : "positive");
      await load();
    } catch (reason) { notify(reason instanceof Error ? reason.message : String(reason), "critical"); }
  };
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const name = profile?.displayName?.split(" ")[0] || auth.name?.split(" ")[0];
  return <div className="overview-page">
    <section className="overview-hero" aria-labelledby="overview-title">
      <div className="overview-hero-copy">
        <span className="overview-eyebrow"><Sparkle24Regular aria-hidden="true" /> YOUR DAILY MOMENTUM</span>
        <p>{greeting}{name ? `, ${name}` : ""}. Let's make room for what matters.</p>
        <h1 id="overview-title">A little clarity.<br />A lot of momentum.</h1>
        <span className="overview-date">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · evaluated on your local business date</span>
      </div>
      <button type="button" className="overview-priority-total" onClick={() => choose("priority")}
        disabled={!snapshot || scopeUnavailable || !hasCapture} aria-label="View Total Priority">
        <span>Total Priority <ArrowRight24Regular aria-hidden="true" /></span>
        <strong>{snapshot && !scopeUnavailable && hasCapture ? number(priorities.length) : "—"}</strong>
        <PipelineValue value={monthlyPipeline(priorities.map(row => row.milestone))} />
        <small>Distinct confirmed · {unknownCount} need evidence · Coaching excluded</small>
      </button>
    </section>

    <div className="overview-toolbar">
      <div className="overview-scopes" role="group" aria-label="Hygiene scope">
        <Button variant={scope === "watched" ? "primary" : "secondary"} aria-pressed={scope === "watched"}
          onClick={() => { setScope("watched"); setOwner(""); setAccount(""); setLimit(50); }}>Watched accounts</Button>
        <Button variant={scope === "mine" ? "primary" : "secondary"} aria-pressed={scope === "mine"}
          onClick={() => { setScope("mine"); setOwner(""); setAccount(""); setLimit(50); }}>My milestones</Button>
      </div>
      <Button busy={loading} onClick={() => void load()}>Reload local cache</Button>
    </div>
    {error ? <ErrorBanner message={`Hygiene cache could not be loaded: ${error}`} onRetry={() => void load()} /> : null}
    {loading && !snapshot ? <Spinner label="Reading your local milestone cache..." /> : null}
    {snapshot ? <>
      <div className="overview-coverage" role="status">
        <strong>{scope === "mine" ? "My milestones · exact cached MSX owner ID" : "Watched top-parent accounts · all owners, including child records"}</strong>
        <p>{scoped.length} distinct cached milestone(s). {captures.filter(capture => !capture.hasData).length} account(s) without a capture.
          {" "}Newest refresh: {times.at(-1) ? new Date(times.at(-1)!).toLocaleString() : "Not known"}.
          {" "}Oldest refresh: {times[0] ? new Date(times[0]).toLocaleString() : "Not known"}.</p>
        <p>Cache-only, bounded coverage: uncached milestones cannot be counted. {scope === "mine" ?
          "Includes available retained captures outside watched accounts; this is not a complete account-independent owner census." :
          "Refresh watched accounts to update saved data; current owners are the owners at the last capture."}
          {" "}30-day window: {today} through {businessDateAfter(today, 30)}. Coaching through {businessDateAfter(today, 60)}.</p>
        <details><summary>Covered date windows and capture exclusions</summary>
          <ul>{captures.map(capture => <li key={capture.accountId}>
            <strong>{capture.name}</strong>{!capture.watched ? " (outside watched accounts)" : ""}: {capture.hasData ?
              `${capture.dateFrom || "Unknown start"} through ${capture.dateTo || "Unknown end"}` : "No saved capture"}.
            {" "}Refreshed {capture.refreshedAt ? new Date(capture.refreshedAt).toLocaleString() : "time not cached"}.
            {" "}Excluded statuses: {capture.excludedStatuses.join(", ") || "not recorded"}.
          </li>)}</ul>
        </details>
      </div>
      {scopeUnavailable ? <div className="callout callout-warning" role="status">
        Cannot evaluate My milestones: the signed-in account's MSX system-user ID is not cached. Refresh your MSX profile in Settings; no name or Team-based fallback is used.
      </div> : null}
      <div className="overview-section-heading"><div><span className="overview-eyebrow">FOCUS YOUR ENERGY</span><h2>Hygiene Priority</h2></div>
        <span>Counts are confirmed flags, not a clearance of missing evidence.</span></div>
      <div className="hygiene-tiles">
        {HYGIENE_RULES.map(rule => {
          const matched = rows.filter(row => row.checks.some(check => check.rule === rule.id && check.result === "flagged"));
          const unknown = rows.filter(row => row.checks.some(check => check.rule === rule.id && check.result === "unknown"));
          const unavailable = scopeUnavailable || !captures.some(capture => capture.hasData);
          return <button key={rule.id} type="button" data-hygiene-rule={rule.id}
            className={`hygiene-tile hygiene-tone-${rule.tone}${rule.id === "coaching" ? " hygiene-coaching" : ""}${selected === rule.id ? " hygiene-tile-selected" : ""}`}
            onClick={() => choose(rule.id, !matched.length && unknown.length ? "unknown" : "flagged")}>
            <span className="hygiene-tile-label">{rule.id === "coaching" ? "COACHING · SEPARATE FROM PRIORITY" : "HYGIENE PRIORITY"}</span>
            <h3>{rule.title}</h3>
            <div className="hygiene-tile-count"><strong>{unavailable ? "—" : number(matched.length)}</strong>
              <span>{unavailable || (!matched.length && unknown.length) ? "Cannot evaluate" : unknown.length ? "confirmed · partial evidence" : "confirmed in cache"}</span></div>
            <PipelineValue value={monthlyPipeline(matched.map(row => row.milestone))} />
            <p>{rule.description}</p>
            <span className="hygiene-tile-footer">{unknown.length} cannot evaluate <ArrowRight24Regular aria-hidden="true" /></span>
          </button>;
        })}
      </div>

      <section className="overview-quick-actions" aria-label="Quick actions">
        <div><span className="overview-eyebrow">KEEP THE MOMENTUM</span><h2>Your next move</h2></div>
        <Button onClick={() => navigate({ name: "portfolio" })}>Open Portfolio</Button>
        <Button onClick={() => navigate({ name: "milestones" })}>Explore milestones</Button>
        <Button onClick={() => { navigate({ name: "settings" }); openManage(); }}>Manage organization</Button>
        <Button variant="primary" busy={fetching} onClick={() => void refresh()}>Refresh watched accounts</Button>
      </section>

      <section className="hygiene-drilldown" ref={list} aria-labelledby="hygiene-list-title">
        <div className="overview-section-heading"><div><span className="overview-eyebrow">MAKE THE NEXT MOVE</span>
          <h2 id="hygiene-list-title">{selected === "priority" ? "Total Priority" : HYGIENE_RULES.find(rule => rule.id === selected)?.title}</h2></div>
          <span>{filtered.length} distinct milestone(s) · {result === "unknown" ? "Cannot evaluate" : "Confirmed flags"}</span></div>
        <div className="hygiene-filters">
          <SelectField label="Exception" value={selected} onChange={event => { setSelected(event.target.value as HygieneRule | "priority"); setLimit(50); }}>
            <option value="priority">Total Priority (distinct)</option>
            {HYGIENE_RULES.map(rule => <option key={rule.id} value={rule.id}>{rule.title}</option>)}
          </SelectField>
          <SelectField label="Result" value={result} onChange={event => { setResult(event.target.value as "flagged" | "unknown"); setLimit(50); }}>
            <option value="flagged">Confirmed flags</option><option value="unknown">Cannot evaluate</option>
          </SelectField>
          <SelectField label="Owner" value={owner} onChange={event => { setOwner(event.target.value); setLimit(50); }}>
            <option value="">All owners</option>{owners.map(([id, label]) => <option key={id} value={id}>{label} ({id})</option>)}
          </SelectField>
          <SelectField label="Account" value={account} onChange={event => { setAccount(event.target.value); setLimit(50); }}>
            <option value="">All accounts</option>{accounts.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </SelectField>
        </div>
        <PipelineValue value={monthlyPipeline(filtered.map(row => row.milestone))} />
        {!filtered.length ? <p className="hygiene-empty">{scopeUnavailable ? "Cannot evaluate this scope without the cached MSX user ID." :
          "No matches in this cached view. Missing evidence and uncached records are not a clean result."}</p> :
          <div className="hygiene-table-scroll"><table className="hygiene-table">
            <thead><tr>{["Account", "Owner", "Milestone / opportunity", "Estimated date", "Status / commitment", "Category / stage", "Monthly value", "Precise reasons"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{filtered.slice(0, limit).map(({ milestone: row, checks }) => <tr key={row.id} data-hygiene-milestone={row.id}>
              <td>{row.accountUrl ? <MsxLink url={row.accountUrl} label="Account">{row.accountName || row.portfolioAccountName}</MsxLink> :
                <strong>{row.accountName || row.portfolioAccountName}</strong>}<small>{row.portfolioAccountName}</small></td>
              <td>{row.ownerUrl ? <MsxLink url={row.ownerUrl} label="Owner">{row.ownerName || "Open owner"}</MsxLink> :
                row.ownerName || "No owner name"}<small>{row.ownerId || "No owner ID"}</small></td>
              <td><MsxLink url={row.url} label="Milestone">{row.name || row.number || row.id}</MsxLink>
                {row.opportunityUrl ? <div><MsxLink url={row.opportunityUrl} label="Opportunity">{row.opportunityName || "Open opportunity"}</MsxLink></div> : <small>Opportunity link not cached</small>}</td>
              <td>{row.date || "Date not cached"}</td>
              <td>{row.status || "Status not cached"}<small>{row.commitment || "Commitment not cached"}</small></td>
              <td>{row.category || "Category not cached"}<small>{mappedOpportunityStage(row)?.label || "Stage cannot be evaluated"}</small></td>
              <td>{row.monthlyUse !== null && Number.isFinite(row.monthlyUse) ? number(row.monthlyUse) : "Value not cached"}<small>{row.hygiene?.currency || "Currency not cached"}</small></td>
              <td>{checks.filter(check => check.result !== "clear").map(check => <div key={check.rule} className={`hygiene-reason hygiene-reason-${check.result}`}>
                <strong>{check.result === "unknown" ? "Cannot evaluate: " : ""}{HYGIENE_RULES.find(rule => rule.id === check.rule)?.title}</strong><span>{check.reason}</span>
              </div>)}</td>
            </tr>)}</tbody>
          </table></div>}
        {filtered.length > limit ? <Button onClick={() => setLimit(value => value + 50)}>Show 50 more</Button> : null}
      </section>
    </> : null}
  </div>;
}
