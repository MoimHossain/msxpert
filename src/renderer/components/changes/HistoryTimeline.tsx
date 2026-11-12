import { useEffect, useState } from "react";
import type { HistoryEvent, HistoryIndex, HistorySelection } from "../../../shared/history";
import { ChangeCard } from "./ChangeList";
import { HistoryRunDrawer } from "../account/HistoryRunDrawer";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { SelectField } from "../ui/SelectField";
import { Spinner } from "../ui/Spinner";
import { ErrorBanner } from "../ui/ErrorBanner";
import { EmptyState } from "../ui/EmptyState";
import { fieldLabel, formatFieldValue } from "../../lib/changes";
import { formatDateTime, formatNumber } from "../../lib/format";
import { useFetch } from "../../state/FetchProvider";

export function HistoryTimeline() {
  const [index, setIndex] = useState<HistoryIndex | null>(null);
  const [date, setDate] = useState("");
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [account, setAccount] = useState("");
  const [owner, setOwner] = useState("");
  const [kind, setKind] = useState("");
  const [field, setField] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [selection, setSelection] = useState<HistorySelection | null>(null);
  const { progress } = useFetch();
  useEffect(() => {
    let active = true;
    setError(null); setLoading(true);
    void window.desktop.getHistoryIndex().then(next => {
      if (active) { setIndex(next); setDate(current => next.days.some(day => day.date === current) ? current : next.days[0]?.date ?? ""); }
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, progress?.finishedAt]);
  useEffect(() => {
    if (!date) return;
    let active = true;
    setLoading(true); setError(null); setEvents([]);
    void window.desktop.getHistoryDay(date).then(next => { if (active) setEvents(next); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, revision, progress?.finishedAt]);
  useEffect(() => { setLimit(50); }, [date, account, owner, kind, field, search]);
  const dayIndex = index?.days.findIndex(day => day.date === date) ?? -1;
  const move = (offset: number) => { const day = index?.days[dayIndex + offset]; if (day) setDate(day.date); };
  const filtered = events.filter(event => (!account || event.account.id === account) && (!kind || event.kind === kind) &&
    (!owner || event.milestone.ownerName === owner) &&
    (!field || ("fields" in event.milestone && event.milestone.fields.some(change => change.field === field))) &&
    (!search.trim() || [event.account.name, event.milestone.name, event.milestone.ownerName, event.milestone.createdByName,
      event.milestone.number, ...("fields" in event.milestone ? event.milestone.fields.flatMap(change =>
        [fieldLabel(change.field), formatFieldValue(change.before), formatFieldValue(change.after)]) : [])]
      .join(" ").toLowerCase().includes(search.trim().toLowerCase())));
  const owners = [...new Set(events.map(event => event.milestone.ownerName).filter((value): value is string => Boolean(value)))].sort();
  const fields = [...new Set(events.flatMap(event => "fields" in event.milestone ? event.milestone.fields.map(change => change.field) : []))].sort();
  return <div className="history-timeline">
    <div className="history-account-heading"><div><h2>History timeline</h2>
      <p>Every recorded change, including reviewed changes. Days use UTC; event timestamps use your local time.
        Baselines are not change events. Inspect a fetch for its original scope and snapshot.</p></div>
      <Button variant="secondary" busy={loading} onClick={() => setRevision(value => value + 1)}>Reload history</Button></div>
    {error ? <ErrorBanner message={error} onRetry={() => setRevision(value => value + 1)} /> : null}
    {index?.days.length ? <>
      <div className="history-day-navigation">
        <Button variant="secondary" disabled={dayIndex < 0 || dayIndex >= index.days.length - 1} onClick={() => move(1)}>Previous day</Button>
        <SelectField label="History day (UTC)" value={date} onChange={event => setDate(event.target.value)}>
          {index.days.map(day => <option key={day.date} value={day.date}>{day.date} - {day.total} changes in {day.runs} fetches</option>)}
        </SelectField>
        <Button variant="secondary" disabled={dayIndex <= 0} onClick={() => move(-1)}>Next day</Button>
      </div>
      <div className="history-day-strip" aria-label="Recorded change days">
        {index.days.map(day => <button key={day.date} className={date === day.date ? "active" : ""} type="button" onClick={() => setDate(day.date)}
          aria-pressed={date === day.date} title={`${day.added} new, ${day.modified} edited, ${day.disappeared} outside scope`}>
          <span>{day.date}</span><strong>{formatNumber(day.total)}</strong>
          <span className="history-day-bar"><i style={{ flex: day.added }} /><i style={{ flex: day.modified }} /><i style={{ flex: day.disappeared }} /></span>
        </button>)}
      </div>
      <div className="change-filters history-filters">
        <TextField label="Search selected day" value={search} onChange={event => setSearch(event.target.value)} />
        <SelectField label="History account" value={account} onChange={event => setAccount(event.target.value)}>
          <option value="">All accounts</option>{index.accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </SelectField>
        <SelectField label="History owner" value={owner} onChange={event => setOwner(event.target.value)}>
          <option value="">All owners</option>{owners.map(value => <option key={value}>{value}</option>)}
        </SelectField>
        <SelectField label="History change type" value={kind} onChange={event => setKind(event.target.value)}>
          <option value="">All types</option><option value="added">New</option><option value="modified">Changed / edited</option><option value="disappeared">Outside scope</option>
        </SelectField>
        <SelectField label="History changed field" value={field} onChange={event => setField(event.target.value)}>
          <option value="">All fields</option>{fields.map(value => <option key={value} value={value}>{fieldLabel(value)}</option>)}
        </SelectField>
        <Button variant="ghost" onClick={() => { setSearch(""); setAccount(""); setOwner(""); setKind(""); setField(""); }}>Clear history filters</Button>
      </div>
      <p className="field-hint">{formatNumber(filtered.length)} of {formatNumber(events.length)} changes on {date}.
        {filtered.length > limit ? ` Showing the first ${limit}; load more below.` : ""}</p>
      {loading ? <Spinner label="Loading saved day..." /> : filtered.length ? filtered.slice(0, limit).map((event, index) =>
        <div className="history-event" key={`${event.account.id}:${event.runId}:${event.kind}:${event.milestone.id}:${index}`}>
          <p className="history-event-context">{event.account.name} | {formatDateTime(event.at)}</p>
          <ChangeCard milestone={event.milestone} kind={event.kind}
            onHistory={() => setSelection({ accountId: event.account.id, runId: event.runId })} />
        </div>) : !error ? <EmptyState title="No matching history events" description="Broaden the selected day's filters." /> : null}
      {filtered.length > limit ? <Button variant="secondary" onClick={() => setLimit(value => value + 50)}>Load 50 more events</Button> : null}
    </> : loading ? <Spinner label="Loading history..." /> : !error ?
      <EmptyState title="No recorded changes yet" description="History begins with changes after the first baseline fetch. Account History includes every successful fetch and failed attempt." /> : null}
    {selection ? <HistoryRunDrawer selection={selection} onChange={setSelection} onClose={() => setSelection(null)} /> : null}
  </div>;
}
