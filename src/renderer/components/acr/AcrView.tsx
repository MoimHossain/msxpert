import { useMemo, useState } from "react";
import type { AcrAccountSnapshot, AcrNode, AcrSnapshot } from "../../../shared/acr";
import { closedTrend } from "../../../domain/acr";
import { useAcr } from "../../state/AcrProvider";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Spinner } from "../ui/Spinner";
import { StatCard } from "../ui/StatCard";
import { TextField } from "../ui/TextField";
import { SelectField } from "../ui/SelectField";
import { FacetPicker } from "../ui/FacetPicker";

const usd = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compactUsd = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD",
  notation: "compact", maximumFractionDigits: 1 });
function Trend({ trend, delta }: { trend: number | null; delta: number }) {
  return <span className={`acr-trend ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}
    title={`${usd(delta)} change between the last two closed months`}>
    {trend === null ? delta ? "New" : "No baseline" : `${trend > 0 ? "+" : ""}${(trend * 100).toFixed(1)}%`}
  </span>;
}
function accountNode(entry: AcrAccountSnapshot): AcrNode {
  return { key: "account", name: entry.account.name, level: 0, path: [entry.account.name], values: entry.totals,
    total: entry.total, delta: entry.delta, trend: entry.trend, children: entry.hierarchy };
}
function AcrSnapshotView({ snapshot }: { snapshot: AcrSnapshot }) {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [movement, setMovement] = useState("");
  const [expanded, setExpanded] = useState(new Set<string>());
  const validAccounts = accounts.filter(tpid => snapshot.accounts.some(entry => entry.account.tpid === tpid));
  const validMonths = months.filter(key => snapshot.months.some(month => month.key === key));
  const selected = snapshot.accounts.filter(entry => !validAccounts.length || validAccounts.includes(entry.account.tpid));
  const visibleMonths = snapshot.months.filter(month => !validMonths.length || validMonths.includes(month.key));
  const totals = Object.fromEntries(snapshot.months.map(month => [month.key,
    selected.reduce((sum, entry) => sum + (entry.totals[month.key] ?? 0), 0)]));
  const trend = closedTrend(totals, snapshot);
  const current = snapshot.months.at(-1)!;
  const closed = snapshot.months.filter(month => !month.provisional);
  const comparison = closed.at(-1)!;
  const prior = closed.at(-2)!;
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = (entry: AcrAccountSnapshot, node: AcrNode): boolean => {
      const text = [entry.account.name, ...node.path].join(" ").toLowerCase();
      return ((!query || text.includes(query)) && (!movement || (movement === "up" ? node.delta > 0 : node.delta < 0)))
        || node.children.some(child => matches(entry, child));
    };
    const result: { entry: AcrAccountSnapshot; node: AcrNode; depth: number; key: string }[] = [];
    const walk = (entry: AcrAccountSnapshot, node: AcrNode, depth: number) => {
      if (!matches(entry, node)) return;
      const key = `${entry.account.tpid}:${node.key}`;
      result.push({ entry, node, depth, key });
      if (query || movement || expanded.has(key)) node.children.forEach(child => walk(entry, child, depth + 1));
    };
    const activeAccounts = accounts.filter(tpid => snapshot.accounts.some(entry => entry.account.tpid === tpid));
    snapshot.accounts.filter(entry => !activeAccounts.length || activeAccounts.includes(entry.account.tpid))
      .forEach(entry => walk(entry, accountNode(entry), 0));
    return result;
  }, [snapshot, accounts, search, movement, expanded]);
  const expandAll = () => {
    const keys = new Set<string>();
    const visit = (tpid: string, node: AcrNode) => {
      keys.add(`${tpid}:${node.key}`);
      node.children.forEach(child => visit(tpid, child));
    };
    selected.forEach(entry => visit(entry.account.tpid, accountNode(entry)));
    setExpanded(keys);
  };
  return <>
    <section className="acr-filters" aria-label="ACR exploration">
      <FacetPicker label="ACR accounts" options={snapshot.accounts.map(entry =>
        ({ value: entry.account.tpid, label: entry.account.name }))} selected={validAccounts} onChange={setAccounts} />
      <FacetPicker label="ACR months" options={snapshot.months.map(month =>
        ({ value: month.key, label: `${month.label} ${month.year}${month.provisional ? " (provisional)" : ""}` }))}
        selected={validMonths} onChange={setMonths} />
      <TextField label="Search ACR services" value={search} type="search" maxLength={1000}
        placeholder="Azure, SQL, Copilot..." onChange={event => setSearch(event.target.value)} />
      <SelectField label="ACR movement" value={movement} onChange={event => setMovement(event.target.value)}>
        <option value="">All movement</option><option value="up">Growing</option><option value="down">Declining</option>
      </SelectField>
      <div className="acr-shaping"><Button onClick={expandAll}>Expand all</Button>
        <Button onClick={() => setExpanded(new Set())}>Collapse</Button>
        <Button variant="ghost" onClick={() => { setAccounts([]); setMonths([]); setSearch(""); setMovement(""); }}>Clear ACR filters</Button></div>
    </section>
    <section className="acr-kpis" aria-label="ACR insights">
      <StatCard label="Last closed month" value={compactUsd(totals[comparison.key] ?? 0)} hint={comparison.key} tone="info" />
      <StatCard label="Closed-month change" value={<Trend {...trend} />} hint={`${usd(trend.delta)} vs ${prior.key}`}
        tone={trend.delta > 0 ? "positive" : trend.delta < 0 ? "critical" : "neutral"} />
      <StatCard label="Current month" value={compactUsd(totals[current.key] ?? 0)} hint={`Provisional | ${current.key}`} tone="warning" />
      <StatCard label="Rolling 12 months" value={compactUsd(total)} hint="USD | includes provisional month" />
      <StatCard label="Service groups" value={selected.reduce((sum, entry) => sum + entry.hierarchy.length, 0)}
        hint={`Level 1 across ${selected.length} selected accounts`} />
    </section>
    <p className="acr-meta">Fetched {new Date(snapshot.fetchedAt).toLocaleString()} ({snapshot.fetchedAt}) by {snapshot.fetchedBy.name}.
      {" "}{selected.length} of {snapshot.accounts.length} cached accounts | {selected.reduce((sum, entry) => sum + entry.rows, 0).toLocaleString()} service-month rows.
      {" "}Window: {snapshot.months[0]!.key} to {current.key}. Showing {visibleMonths.length} months.
      {" "}Trend: {comparison.key} vs {prior.key}; {current.key} is provisional. All values USD.</p>
    <div className="acr-table-wrap" tabIndex={0} role="region" aria-label="ACR service hierarchy">
      <table className="acr-table"><caption className="sr-only">Azure Consumed Revenue by account, service and fiscal month, in USD</caption>
        <thead><tr><th scope="col" className="acr-service">Service hierarchy</th>
          {visibleMonths.map(month => <th scope="col" key={month.key} className={month.provisional ? "acr-open" : ""}>
            {month.label} {month.year}{month.provisional ? <small>Provisional</small> : null}</th>)}
          <th scope="col" title={`${comparison.key} vs ${prior.key}`}>Closed trend</th><th scope="col">12M total</th></tr></thead>
        <tbody><tr className="acr-total"><th scope="row" className="acr-service">All selected accounts</th>
          {visibleMonths.map(month => <td key={month.key} className={month.provisional ? "acr-open" : ""} title={usd(totals[month.key] ?? 0)}>
            {compactUsd(totals[month.key] ?? 0)}</td>)}<td><Trend {...trend} /></td><td title={usd(total)}>{compactUsd(total)}</td></tr>
          {rows.map(({ node, depth, key }) => <tr key={key} data-acr-level={node.level} className={node.level === 0 ? "acr-account" : ""}>
            <th scope="row" className="acr-service"><div className="acr-name" style={{ paddingLeft: depth * 18 }}>
              {node.children.length ? <button type="button" className="acr-toggle"
                aria-label={`${expanded.has(key) || search.trim() || movement ? "Collapse" : "Expand"} ${node.name}`}
                aria-expanded={Boolean(expanded.has(key) || search.trim() || movement)}
                disabled={Boolean(search.trim() || movement)}
                onClick={() => setExpanded(previous => {
                  const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next;
                })}>{expanded.has(key) || search.trim() || movement ? "-" : "+"}</button> : <span className="acr-leaf" />}
              <span title={node.path.join(" > ")}>{node.name}</span><small>{node.level ? `L${node.level}` : "ACCOUNT"}</small>
            </div></th>
            {visibleMonths.map(month => <td key={month.key} className={month.provisional ? "acr-open" : ""}
              title={usd(node.values[month.key] ?? 0)}>{compactUsd(node.values[month.key] ?? 0)}</td>)}
            <td><Trend trend={node.trend} delta={node.delta} /></td><td title={usd(node.total)}>{compactUsd(node.total)}</td>
          </tr>)}
          {!rows.length ? <tr><td colSpan={visibleMonths.length + 3}>No service rows match your filters.</td></tr> : null}
        </tbody>
      </table>
    </div>
  </>;
}

export function AcrView() {
  const { state, loading, error, busy, pending, connect, disconnect, fetch, cancel, refresh, openProgress } = useAcr();
  const snapshot = state?.snapshot;
  const stale = snapshot && Date.now() - Date.parse(snapshot.fetchedAt) > 30 * 86400000;
  return <div className="acr-page">
    <PageHeader title="ACR" subtitle="Your Azure consumption, from portfolio to service. One clear view."
      actions={<>
        <Button onClick={connect} disabled={busy || loading || !state} busy={pending === "connect"}>
          {state?.connection.connected ? "Reconnect Power BI" : "Connect Power BI"}</Button>
        {state?.connection.connected ? <Button onClick={disconnect} disabled={busy}>Disconnect Power BI</Button> : null}
        <Button variant="primary" onClick={fetch} disabled={busy || !state?.connection.connected || !state.configuredAccounts}>
          Fetch ACR</Button>
        {busy ? <Button onClick={cancel}>Cancel ACR operation</Button> : null}
        {state?.progress ? <Button onClick={openProgress}>{state.progress.running ? "ACR progress" : "ACR fetch results"}</Button> : null}
      </>} />
    <div className="acr-connection"><span className={`status-dot ${state?.connection.connected ? "connected" : ""}`} />
      {state?.connection.connected ? `Power BI connected as ${state.connection.user?.name} (${state.connection.user?.username})`
        : "Connect your own Power BI access. Each employee's model permissions and row-level security apply."}
      <Button variant="ghost" onClick={refresh} disabled={loading || busy}>Refresh ACR status</Button></div>
    <details className="acr-interface-notice"><summary>Internal Power BI interface | local, employee-isolated cache</summary>
      <p>This reader uses unsupported internal querydata interfaces and model IDs, which may change.
        The existing public-client registration grants no new model access. Tokens stay encrypted on this Windows device;
        fetching never opens a browser. Cached entitlements reflect the snapshot's fetch time, not a new access check.</p></details>
    {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
    {state?.cacheError ? <ErrorBanner message={state.cacheError} /> : null}
    {state?.connection.error && !state.connection.connected ? <p className="field-hint">{state.connection.error}</p> : null}
    {loading && !state ? <Spinner label="Opening your ACR workspace..." /> : null}
    {pending === "connect" ? <p role="status">Complete Microsoft sign-in in the browser. Choose the employee currently signed in to MSX.</p> : null}
    {state?.progress?.running ? <div className="acr-refresh-banner" role="status">
      Refreshing {state.progress.completed}/{state.progress.total} accounts.
      {state.progress.active.length ? ` Querying ${state.progress.active.map(account => account.name).join(", ")}.` : ""}
      {" "}Your previous snapshot stays available. <Button variant="ghost" onClick={openProgress}>View ACR progress</Button></div> : null}
    {state?.coverageChanged ? <p className="acr-warning">Configured accounts changed since this snapshot. Removed accounts are hidden; fetch to update coverage.</p> : null}
    {stale ? <p className="acr-warning">This snapshot is over 30 days old. Refresh before relying on its consumption figures.</p> : null}
    {snapshot?.skipped.length ? <details className="acr-meta"><summary>{snapshot.skipped.length} configured accounts were outside Power BI entitlement at fetch time</summary>
      <ul>{snapshot.skipped.map(account => <li key={account.tpid}>{account.name} (TPID {account.tpid})</li>)}</ul></details> : null}
    {snapshot?.accounts.length ? <AcrSnapshotView key={state!.scopeId} snapshot={snapshot} /> : !loading && state ? <EmptyState
      title={!state.connection.connected ? "Connect your Power BI access" : snapshot ? "No permitted accounts in this snapshot" : "Your consumption story starts here"}
      description={!state.configuredAccounts ? "Add top-parent accounts in Portfolio before fetching ACR."
        : snapshot ? `Access was checked at ${new Date(snapshot.fetchedAt).toLocaleString()}. None of your configured top-parent accounts were permitted.`
          : "Fetch a 12-month snapshot for your accessible watched top parents, then explore all five service levels."} /> : null}
  </div>;
}
