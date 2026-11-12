import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox, Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-components";
import type { MilestoneRow } from "../../../shared/types";
import { SORT_KEYS, MAX_EXPORT_ROWS, type MilestoneFilterSeeds, type MilestoneSortKey, type MilestoneViewState } from "../../../shared/milestones";
import { FACET_LABELS, filterIssue, groupMilestones, initialMilestoneView, orderedMilestones, pageMilestoneRows } from "../../../domain/milestone-view";
import { MilestoneFilterBar } from "../milestones/MilestoneFilterBar";
import { SelectField } from "../ui/SelectField";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { MilestoneDetailDrawer } from "./MilestoneDetailDrawer";
import { formatDate, formatNumber } from "../../lib/format";
import { statusTone, commitmentTone } from "../../lib/status";
import { COLUMN_KEYS, COLUMN_LABELS, minimumWidth, useMilestoneColumns } from "../../hooks/useMilestoneColumns";
import { useToast } from "../../state/ToastProvider";
import { useUpdateBlocker } from "../../state/UpdateProvider";
import { isSafeExternalUrl } from "../../lib/url";
import { MsxLink } from "../ui/MsxLink";

interface MilestoneTableProps {
  milestones: MilestoneRow[];
  initialFilters?: MilestoneFilterSeeds;
  history?: import("../../../shared/history").HistorySelection;
}

function cellValue(milestone: MilestoneRow, key: MilestoneSortKey) {
  if (key === "name") return <div className="milestone-name-summary">
    <span className="milestone-cell-text" title={milestone.name ?? ""}>{milestone.name ?? "-"}</span>
    {milestone.accountName ? <span className="milestone-cell-text milestone-summary-detail milestone-account-detail"
      title={`MSX account: ${milestone.accountName}`} aria-label={`MSX account: ${milestone.accountName}`}>
      {milestone.accountName}
    </span> : null}
    {milestone.workload ? <span className="milestone-cell-text milestone-summary-detail milestone-workload-detail"
      title={`Workload: ${milestone.workload}`} aria-label={`Workload: ${milestone.workload}`}>
      {milestone.workload}
    </span> : null}
  </div>;
  if (key === "date") return formatDate(milestone.date);
  if (key === "monthlyUse") return milestone.monthlyUseFormatted ?? formatNumber(milestone.monthlyUse);
  if (key === "status") return <Badge tone={statusTone(milestone.status)}>{milestone.status ?? "Unknown"}</Badge>;
  if (key === "commitment") return <Badge tone={commitmentTone(milestone.commitment)}>{milestone.commitment ?? "-"}</Badge>;
  return <span className="milestone-cell-text">{milestone[key] ?? (key === "ownerName" ? "Unassigned" : "-")}</span>;
}

export function MilestoneTable({ milestones, initialFilters, history }: MilestoneTableProps) {
  const [view, setView] = useState(() => initialMilestoneView(initialFilters));
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<MilestoneRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const { notify } = useToast();
  const layout = useMilestoneColumns();
  const drag = useRef<{ key: MilestoneSortKey; x: number; width: number } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);
  useUpdateBlocker(exporting);

  const ordered = useMemo(() => orderedMilestones(milestones, view), [milestones, view]);
  const groups = useMemo(() => groupMilestones(ordered, view.groupBy), [ordered, view.groupBy]);
  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const displayRows = useMemo(() => pageMilestoneRows(ordered, view.groupBy, collapsed, currentPage * pageSize, pageSize),
    [ordered, view.groupBy, collapsed, currentPage, pageSize]);
  const issue = filterIssue(view.filters);
  const hasRows = ordered.length > 0;
  useEffect(() => {
    if (!grid.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) setGridWidth(entries[0].contentRect.width);
    });
    observer.observe(grid.current);
    return () => observer.disconnect();
  }, [hasRows]);
  const widthFor = (key: MilestoneSortKey) => layout.frozen === key && gridWidth ?
    Math.min(layout.widths[key], Math.max(minimumWidth(key), gridWidth - 100)) : layout.widths[key];
  const changeView = (next: MilestoneViewState) => {
    setView(next); setPage(0); setCollapsed(new Set()); setExportMessage(null);
  };
  const toggleSort = (sortKey: MilestoneSortKey) => changeView({ ...view, sortKey,
    sortDirection: view.sortKey === sortKey && view.sortDirection === "asc" ? "desc" : "asc" });
  const toggleGroup = (id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const collapseAll = () => {
    const ids = new Set<string>();
    const walk = (nodes: typeof groups) => nodes.forEach(group => { ids.add(group.id); walk(group.children); });
    walk(groups); setCollapsed(ids);
  };
  const exportExcel = async () => {
    setExporting(true); setExportMessage(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(ordered)));
      const expectedHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
      const result = await window.desktop.exportMilestones({
        ...(history ? { history } : {}),
        accountIds: [...new Set(milestones.map(row => row.portfolioAccountId))],
        view, expectedIds: ordered.map(row => row.id), expectedHash,
      });
      const message = `Saved ${formatNumber(result.rowCount)} milestones to ${result.path}. ${result.revealError ?? "Requested File Explorer to select the file."}`;
      setExportMessage(message);
      notify(`Exported ${formatNumber(result.rowCount)} milestones to Downloads.${result.revealError ? " The folder could not be opened; see the saved path in this view." : ""}`,
        result.revealError ? "warning" : "positive");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportMessage(`Export failed: ${message}`); notify(message, "critical");
    } finally { setExporting(false); }
  };

  return (
    <div className="milestone-table-wrap">
      <MilestoneFilterBar milestones={milestones} value={view} onChange={changeView} />
      {issue ? <p className="field-error" role="alert">{issue}</p> : null}
      <div className="milestone-grid-toolbar">
        <p className="milestone-count" aria-live="polite">
          Showing {formatNumber(ordered.length)} of {formatNumber(milestones.length)} milestones
          {collapsed.size ? ` (${collapsed.size} groups collapsed)` : ""}
        </p>
        <SelectField label="Freeze column" value={layout.frozen} onChange={event => {
          const key = SORT_KEYS.find(value => value === event.target.value);
          if (key || event.target.value === "none") layout.freeze(key ?? "none");
        }}>
          <option value="none">None</option>
          {SORT_KEYS.map(key => <option key={key} value={key}>{COLUMN_LABELS[key]}{layout.hidden.includes(key) ? " (hidden)" : ""}</option>)}
        </SelectField>
        <Popover positioning="below-end">
          <PopoverTrigger disableButtonEnhancement><Button variant="secondary">Columns</Button></PopoverTrigger>
          <PopoverSurface className="milestone-column-picker">
            <p><strong>Visible columns</strong></p>
            <div className="milestone-column-choices" role="group" aria-label="Visible milestone columns">
              {COLUMN_KEYS.map(key => <Checkbox key={key} name={`milestone-column-${key}`}
                label={key === "actions" ? "Links & details" : COLUMN_LABELS[key]}
                checked={!layout.hidden.includes(key)}
                disabled={!layout.hidden.includes(key) && layout.hidden.length === COLUMN_KEYS.length - 1}
                onChange={(_event, data) => layout.setVisible(key, data.checked === true)} />)}
            </div>
            <p className="field-hint">Keep at least one column visible. Hidden columns retain their widths and freeze preference.
              Freezing a hidden column shows it. Export always includes all data columns.</p>
          </PopoverSurface>
        </Popover>
        <Button variant="ghost" onClick={layout.reset}>Reset columns</Button>
        {view.groupBy.length ? <>
          <Button variant="ghost" onClick={() => setCollapsed(new Set())} disabled={!collapsed.size}>Expand all</Button>
          <Button variant="ghost" onClick={collapseAll}>Collapse all</Button>
        </> : null}
        <Button variant="secondary" busy={exporting} disabled={Boolean(issue) || !ordered.length || ordered.length > MAX_EXPORT_ROWS}
          onClick={() => void exportExcel()}>Export Excel</Button>
      </div>
      <p className="field-hint milestone-grid-hint">
        Drag header dividers to resize; focus a divider and use arrow keys (Shift for larger steps), or Home to reset.
        The frozen column moves first. Monthly use remains in source units. Export includes all matches, not just this page,
        and saves unencrypted business data to Downloads outside the app vault.
      </p>
      {ordered.length > MAX_EXPORT_ROWS ? <p className="field-error" role="alert">Narrow the filters to {formatNumber(MAX_EXPORT_ROWS)} or fewer milestones before exporting.</p> : null}
      {exportMessage ? <p className="milestone-export-result" role="status">{exportMessage}</p> : null}
      {!ordered.length ? <EmptyState title={issue ? "Correct the filter bounds" : "No milestones match these filters"}
        description="Try clearing a filter or broadening your search." /> : <>
        <div ref={grid} className="table-scroll milestone-grid-scroll" role="region" aria-label="Milestone results, horizontally scrollable" tabIndex={0}>
          <table className="data-table milestone-grid" style={{ width: layout.columns.reduce((sum, key) => sum + widthFor(key), layout.showActions ? 180 : 0) }}>
            <colgroup>{layout.columns.map(key => <col key={key} style={{ width: widthFor(key) }} />)}{layout.showActions ? <col style={{ width: 180 }} /> : null}</colgroup>
            <thead><tr>
              {layout.columns.map(key => <th key={key} scope="col" data-column={key} className={layout.frozen === key ? "milestone-pinned" : undefined}
                aria-sort={view.sortKey === key ? view.sortDirection === "asc" ? "ascending" : "descending" : "none"}>
                <button type="button" className="table-sort-button" onClick={() => toggleSort(key)}>
                  {COLUMN_LABELS[key]}{view.sortKey === key ? <span aria-hidden="true">{view.sortDirection === "asc" ? " \u25B2" : " \u25BC"}</span> : null}
                </button>
                <div className="column-resizer" role="separator" aria-orientation="vertical" tabIndex={0}
                  aria-label={`Resize ${COLUMN_LABELS[key]} column`} aria-valuenow={widthFor(key)} aria-valuemin={minimumWidth(key)} aria-valuemax={900}
                  onPointerDown={event => {
                    if (event.button !== 0) return;
                    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { key, x: event.clientX, width: widthFor(key) };
                  }}
                  onPointerMove={event => {
                    if (drag.current?.key === key) layout.resize(key, drag.current.width + event.clientX - drag.current.x);
                  }}
                  onPointerUp={event => {
                    if (!drag.current) return;
                    drag.current = null; layout.commit(); event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onLostPointerCapture={() => { if (drag.current) { drag.current = null; layout.commit(); } }}
                  onKeyDown={event => {
                    if (event.key === "Home") { event.preventDefault(); layout.resetWidth(key); }
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                      event.preventDefault();
                      layout.resize(key, widthFor(key) + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 40 : 10), true);
                    }
                  }} />
              </th>)}
              {layout.showActions ? <th scope="col">Links &amp; details</th> : null}
            </tr></thead>
            <tbody>{displayRows.map(row => row.kind === "group" ?
              <tr key={`group:${row.group.id}`} className="milestone-group-row"><td colSpan={layout.columns.length + (layout.showActions ? 1 : 0)}>
                <button type="button" className="milestone-group-toggle" style={{ paddingLeft: 12 + row.group.depth * 20, maxWidth: Math.min(520, gridWidth || 520) }}
                  aria-expanded={!collapsed.has(row.group.id)} onClick={() => toggleGroup(row.group.id)}>
                  <span aria-hidden="true">{collapsed.has(row.group.id) ? "\u25B8" : "\u25BE"}</span>
                  {FACET_LABELS[row.group.field]}: {row.group.label} <span>({formatNumber(row.group.rows.length)})</span>
                </button>
              </td></tr> :
              <tr key={row.milestone.id} data-milestone-id={row.milestone.id}>
                {layout.columns.map(key => <td key={key} data-column={key}
                  className={`${layout.frozen === key ? "milestone-pinned " : ""}${key === "name" ? "milestone-name-cell" : ""}`}
                  title={String(row.milestone[key] ?? "")}>{cellValue(row.milestone, key)}</td>)}
                {layout.showActions ? <td>
                  <div className="milestone-row-actions">
                    {isSafeExternalUrl(row.milestone.url) ?
                      <MsxLink url={row.milestone.url} label="Milestone" /> :
                      <span className="text-muted">No milestone link</span>}
                    {isSafeExternalUrl(row.milestone.opportunityUrl) ?
                      <MsxLink url={row.milestone.opportunityUrl} label="Opportunity" /> :
                      <span className="text-muted">No opportunity link</span>}
                    <button type="button" className="link-button" onClick={() => setSelected(row.milestone)}>View</button>
                  </div>
                </td> : null}
              </tr>)}</tbody>
          </table>
        </div>
        <div className="pagination">
          <SelectField label="Rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}>
            {[25, 50, 100].map(size => <option key={size} value={size}>{size} per page</option>)}
          </SelectField>
          <div className="pagination-controls">
            <Button variant="ghost" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={currentPage === 0}>Previous</Button>
            <span>Page {currentPage + 1} of {pageCount}</span>
            <Button variant="ghost" onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))} disabled={currentPage >= pageCount - 1}>Next</Button>
          </div>
        </div>
      </>}
      {selected ? <MilestoneDetailDrawer milestone={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
