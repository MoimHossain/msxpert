import { useMemo, useState } from "react";
import type { NormalizedMilestone } from "../../../shared/types";
import { TextField } from "../ui/TextField";
import { SelectField } from "../ui/SelectField";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { MilestoneDetailDrawer } from "./MilestoneDetailDrawer";
import { formatDate, formatNumber } from "../../lib/format";
import { statusTone, commitmentTone } from "../../lib/status";
import {
  applyFilters,
  deriveFilterOptions,
  EMPTY_FILTERS,
  monthLabel,
  sortMilestones,
  type MilestoneFilters,
  type MilestoneSortKey,
  type SortDirection,
} from "../../lib/milestoneFilters";

interface MilestoneTableProps {
  milestones: NormalizedMilestone[];
  initialFilters?: Partial<MilestoneFilters>;
}

interface ColumnDef {
  key: MilestoneSortKey;
  label: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "number", label: "Number" },
  { key: "name", label: "Name" },
  { key: "date", label: "Date" },
  { key: "status", label: "Status" },
  { key: "commitment", label: "Commitment" },
  { key: "ownerName", label: "Owner" },
  { key: "accountName", label: "Account" },
  { key: "monthlyUse", label: "Monthly use" },
  { key: "solutionArea", label: "Solution area" },
];

const PAGE_SIZES = [25, 50, 100];

export function MilestoneTable({ milestones, initialFilters }: MilestoneTableProps) {
  const [filters, setFilters] = useState<MilestoneFilters>({
    ...EMPTY_FILTERS,
    ...initialFilters,
  });
  const [sortKey, setSortKey] = useState<MilestoneSortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<NormalizedMilestone | null>(null);

  const options = useMemo(() => deriveFilterOptions(milestones), [milestones]);
  const filtered = useMemo(() => applyFilters(milestones, filters), [milestones, filters]);
  const sorted = useMemo(
    () => sortMilestones(filtered, sortKey, sortDirection),
    [filtered, sortKey, sortDirection],
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  const hasActiveFilters = Object.values(filters).some((value) => value !== "");

  const updateFilter = (patch: Partial<MilestoneFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(0);
  };

  const toggleSort = (key: MilestoneSortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  return (
    <div className="milestone-table-wrap">
      <div className="milestone-filters">
        <TextField
          label="Search milestones"
          hideLabel
          placeholder="Search by name, number, owner, account, or opportunity"
          value={filters.search}
          onChange={(event) => updateFilter({ search: event.target.value })}
        />
        <SelectField
          label="Status"
          value={filters.status}
          onChange={(event) => updateFilter({ status: event.target.value })}
        >
          <option value="">All statuses</option>
          {options.statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Owner"
          value={filters.owner}
          onChange={(event) => updateFilter({ owner: event.target.value })}
        >
          <option value="">All owners</option>
          {options.owners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Account"
          value={filters.account}
          onChange={(event) => updateFilter({ account: event.target.value })}
        >
          <option value="">All accounts</option>
          {options.accounts.map((account) => (
            <option key={account} value={account}>
              {account}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Commitment"
          value={filters.commitment}
          onChange={(event) => updateFilter({ commitment: event.target.value })}
        >
          <option value="">All commitments</option>
          {options.commitments.map((commitment) => (
            <option key={commitment} value={commitment}>
              {commitment}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Month"
          value={filters.month}
          onChange={(event) => updateFilter({ month: event.target.value })}
        >
          <option value="">All months</option>
          {options.months.map((month) => (
            <option key={month} value={month}>
              {monthLabel(month)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Solution area"
          value={filters.solutionArea}
          onChange={(event) => updateFilter({ solutionArea: event.target.value })}
        >
          <option value="">All solution areas</option>
          {options.solutionAreas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </SelectField>
        {hasActiveFilters ? (
          <Button variant="ghost" onClick={() => updateFilter(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <p className="milestone-count" aria-live="polite">
        Showing {formatNumber(sorted.length)} of {formatNumber(milestones.length)} milestones
      </p>

      {sorted.length === 0 ? (
        <EmptyState
          title="No milestones match these filters"
          description="Try clearing a filter or broadening your search."
        />
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      aria-sort={
                        sortKey === column.key
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="table-sort-button"
                        onClick={() => toggleSort(column.key)}
                      >
                        {column.label}
                        {sortKey === column.key ? (
                          <span aria-hidden="true">
                            {sortDirection === "asc" ? " \u25B2" : " \u25BC"}
                          </span>
                        ) : null}
                      </button>
                    </th>
                  ))}
                  <th>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((milestone) => (
                  <tr key={milestone.id}>
                    <td>{milestone.number ?? "-"}</td>
                    <td>{milestone.name ?? "-"}</td>
                    <td>{formatDate(milestone.date)}</td>
                    <td>
                      <Badge tone={statusTone(milestone.status)}>
                        {milestone.status ?? "Unknown"}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={commitmentTone(milestone.commitment)}>
                        {milestone.commitment ?? "-"}
                      </Badge>
                    </td>
                    <td>{milestone.ownerName ?? "Unassigned"}</td>
                    <td>{milestone.accountName ?? "-"}</td>
                    <td>{milestone.monthlyUseFormatted ?? formatNumber(milestone.monthlyUse)}</td>
                    <td>{milestone.solutionArea ?? "-"}</td>
                    <td>
                      <Button variant="ghost" onClick={() => setSelected(milestone)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <SelectField
              label="Rows per page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </SelectField>
            <div className="pagination-controls">
              <Button
                variant="ghost"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={currentPage === 0}
              >
                Previous
              </Button>
              <span>
                Page {currentPage + 1} of {pageCount}
              </span>
              <Button
                variant="ghost"
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                disabled={currentPage >= pageCount - 1}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {selected ? (
        <MilestoneDetailDrawer milestone={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
