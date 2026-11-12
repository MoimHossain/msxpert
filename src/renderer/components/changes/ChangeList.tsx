import { useMemo, useState } from "react";
import type { ChangeSet, FieldChange, MilestoneSummary, ModifiedMilestone } from "../../../shared/types";
import { Badge } from "../ui/Badge";
import { TextField } from "../ui/TextField";
import { SelectField } from "../ui/SelectField";
import { EmptyState } from "../ui/EmptyState";
import { formatDate, formatNumber } from "../../lib/format";
import { fieldLabel, formatFieldValue } from "../../lib/changes";
import { commitmentTone, statusTone } from "../../lib/status";
import { isSafeExternalUrl } from "../../lib/url";
import { MsxLink } from "../ui/MsxLink";

type ChangeKind = "added" | "modified" | "disappeared" | "churn";
const KIND_LABELS: Record<ChangeKind, string> = { added: "New", modified: "Changed", disappeared: "Out of scope", churn: "Changed back" };
const GONE_LABELS = { status: "Closed", date: "Re-dated", account: "Moved", unavailable: "Unavailable", unknown: "Out of scope" };

function Value({ value, field, before = false }: { value: unknown; field: string; before?: boolean }) {
  const text = field === "date" && typeof value === "string" ? formatDate(value) : formatFieldValue(value);
  const content = before ? <del className="diff-before">{text}</del> : <ins className="diff-after">{text}</ins>;
  return text.length > 360 ? <details className="change-long-value">
    <summary>{text.slice(0, 180)}... <strong>Read full value ({text.length} characters)</strong></summary>{content}
  </details> : content;
}

export function FieldDiffs({ fields }: { fields: FieldChange[] }) {
  return <dl className="change-field-diffs">{fields.map(change => {
    const delta = change.field === "monthlyUse" && typeof change.before === "number" && typeof change.after === "number" ?
      change.after - change.before : null;
    return <div key={change.field} className="change-field-row">
      <dt>{fieldLabel(change.field)}{(change.hops ?? 0) > 1 ? <small>{change.hops} edits</small> : null}
        {delta !== null ? <small className={delta < 0 ? "change-delta-down" : "change-delta-up"}>
          {delta > 0 ? "+" : ""}{formatNumber(delta)} source units
        </small> : null}
      </dt>
      <dd><Value value={change.before} field={change.field} before /><span className="diff-arrow" aria-label="changed to">{"\u2192"}</span>
        <Value value={change.after} field={change.field} /></dd>
    </div>;
  })}</dl>;
}

export function ChangeCard({ milestone, kind, onHistory }: {
  milestone: MilestoneSummary | ModifiedMilestone; kind: ChangeKind; onHistory?: () => void;
}) {
  const fields: FieldChange[] = "fields" in milestone ? milestone.fields : [];
  const current = milestone.gone?.current;
  const goneFields: FieldChange[] = current ? (["status", "date", "ownerName", "accountName"] as const)
    .filter(field => current[field] !== milestone[field])
    .map(field => ({ field, before: milestone[field], after: current[field] })) : [];
  const silent = "unwatchedOnly" in milestone && milestone.unwatchedOnly;
  const label = kind === "disappeared" ? GONE_LABELS[milestone.gone?.reason ?? "unknown"] : silent ? "Edited" : KIND_LABELS[kind];
  return <article className={`change-card change-card-${kind}`} data-change-kind={kind}>
    <div className="change-card-heading">
      <span className={`change-kind change-kind-${kind}`}>{label}</span>
      <div className="change-card-identity"><h4 title={milestone.name ?? milestone.number ?? "Untitled milestone"}>
        {milestone.name ?? milestone.number ?? "Untitled milestone"}</h4>
        <p title={milestone.accountName ?? "Unknown account"}>{milestone.accountName ?? "Unknown account"}{milestone.number ? ` | ${milestone.number}` : ""}</p>
      </div>
      <div className="change-card-signals">
        {milestone.status ? <Badge tone={statusTone(milestone.status)}>{milestone.status}</Badge> : null}
        {milestone.commitment ? <Badge tone={commitmentTone(milestone.commitment)}>{milestone.commitment}</Badge> : null}
        {milestone.monthlyUse !== null ? <strong className="change-amount" title="Monthly use, in source units">
          {milestone.monthlyUseFormatted ?? formatNumber(milestone.monthlyUse)}</strong> : null}
      </div>
      <div className="change-card-meta">
        <span title={milestone.ownerName ?? "Unassigned"}>{milestone.ownerName ?? "Unassigned"}</span><span>{formatDate(milestone.date)}</span>
        {milestone.createdByName && milestone.createdByName !== milestone.ownerName ?
          <span>Raised by {milestone.createdByName}</span> : null}
      </div>
      <div className="change-card-links">
        {onHistory ? <button className="link-button" type="button" onClick={onHistory}>Inspect fetch</button> : null}
        {isSafeExternalUrl(milestone.url) ? <MsxLink url={milestone.url} label="MSX">MSX {"\u2197"}</MsxLink> : null}
      </div>
    </div>
    {kind === "disappeared" ? <div className="change-gone-reason">
      <strong>Why it left scope</strong><span>{milestone.gone?.summary ?? "No longer matches the saved capture scope; the reason is not available."}</span>
      {milestone.gone?.current?.modifiedOn ? <small>MSX modified: {formatDate(milestone.gone.current.modifiedOn)}</small> : null}
    </div> : null}
    {fields.length ? <FieldDiffs fields={fields} /> : silent ? <p className="change-silent-note">
      MSX recorded an edit, but none of the watched fields changed. This does not imply a delivery or consumption change.
    </p> : null}
    {goneFields.length ? <FieldDiffs fields={goneFields} /> : null}
  </article>;
}

export function ChangeList({ changes }: { changes: ChangeSet }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [owner, setOwner] = useState("");
  const [field, setField] = useState("");
  const rows = useMemo(() => (["added", "modified", "disappeared", "churn"] as const)
    .flatMap(kind => changes[kind].map(milestone => ({ kind, milestone }))), [changes]);
  const filtered = rows.filter(row => (!kind || row.kind === kind) && (!owner || row.milestone.ownerName === owner) &&
    (!field || ("fields" in row.milestone && row.milestone.fields.some(change => change.field === field))) &&
    (!search.trim() || [row.milestone.name, row.milestone.number, row.milestone.ownerName, row.milestone.createdByName,
      row.milestone.accountName, ...("fields" in row.milestone ? row.milestone.fields.flatMap(change =>
        [fieldLabel(change.field), formatFieldValue(change.before), formatFieldValue(change.after)]) : [])]
      .join(" ").toLowerCase().includes(search.trim().toLowerCase())));
  const owners = [...new Set(rows.map(row => row.milestone.ownerName).filter((value): value is string => Boolean(value)))].sort();
  const shownMilestones = [...new Map(filtered.map(row => [row.milestone.id, row.milestone])).values()];
  const fields = [...new Set(rows.flatMap(row => "fields" in row.milestone ? row.milestone.fields.map(change => change.field) : []))].sort();
  return <div className="change-list">
    <div className="change-insights" aria-label="Change insights">
      <div><strong>{formatNumber(filtered.length)}</strong><span>Changes shown / {formatNumber(rows.length)}</span></div>
      <div><strong>{formatNumber(shownMilestones.filter(row => row.commitment === "Committed").length)}</strong><span>Committed milestones</span></div>
      <div><strong>{formatNumber(shownMilestones.filter(row => ["Blocked", "At Risk"].includes(row.status ?? "")).length)}</strong><span>Blocked or at risk</span></div>
      <div><strong>{formatNumber(new Set(filtered.map(row => row.milestone.ownerName).filter(Boolean)).size)}</strong><span>Distinct owners</span></div>
    </div>
    <div className="change-filters">
      <TextField label="Search changes" value={search} onChange={event => setSearch(event.target.value)} placeholder="Milestone, owner, creator, before or after value" />
      <SelectField label="Change type" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="">All types</option>{Object.entries(KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </SelectField>
      <SelectField label="Change owner" value={owner} onChange={event => setOwner(event.target.value)}>
        <option value="">All owners</option>{owners.map(value => <option key={value}>{value}</option>)}
      </SelectField>
      <SelectField label="Changed field" value={field} onChange={event => setField(event.target.value)}>
        <option value="">All fields</option>{fields.map(value => <option key={value} value={value}>{fieldLabel(value)}</option>)}
      </SelectField>
    </div>
    {filtered.length ? (["added", "modified", "disappeared", "churn"] as const).map(type => {
      const members = filtered.filter(row => row.kind === type);
      return members.length ? <section key={type} className="change-kind-section">
        <h3>{KIND_LABELS[type]} <span>{formatNumber(members.length)}</span></h3>
        {members.map(row => <ChangeCard key={row.milestone.id} milestone={row.milestone} kind={type} />)}
      </section> : null;
    }) : <EmptyState title={rows.length ? "No changes match" : "No changes in this fetch"}
      description={rows.length ? "Broaden the search or clear the change filters." : "This successful fetch recorded no milestone changes."} />}
  </div>;
}
