import type {
  ChangeDocument,
  ChangeSet,
  FieldChange,
  MilestoneSummary,
  ModifiedMilestone,
  NormalizedMilestone,
} from "../shared/types";

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null && right == null) return true;
  if (typeof left === "number" && typeof right === "number") return left === right;
  return String(left ?? "") === String(right ?? "");
}

export function milestoneSummary(milestone: NormalizedMilestone): MilestoneSummary {
  return {
    id: milestone.id,
    number: milestone.number,
    name: milestone.name,
    date: milestone.date,
    status: milestone.status,
    commitment: milestone.commitment,
    monthlyUse: milestone.monthlyUse,
    ownerName: milestone.ownerName,
    createdByName: milestone.createdByName ?? null,
    monthlyUseFormatted: milestone.monthlyUseFormatted,
    accountName: milestone.accountName,
    url: milestone.url,
  };
}

export function diffSnapshots(
  before: NormalizedMilestone[],
  after: NormalizedMilestone[],
  watchedFields: readonly string[],
): Omit<ChangeSet, "churn"> {
  const previous = new Map(before.map((milestone) => [milestone.id, milestone]));
  const current = new Map(after.map((milestone) => [milestone.id, milestone]));
  const added: MilestoneSummary[] = [];
  const modified: ModifiedMilestone[] = [];
  const disappeared: MilestoneSummary[] = [];

  for (const [id, milestone] of current) {
    const old = previous.get(id);
    if (!old) {
      added.push(milestoneSummary(milestone));
      continue;
    }
    if (
      old.versionNumber &&
      milestone.versionNumber &&
      old.versionNumber === milestone.versionNumber
    ) {
      continue;
    }

    const fields: FieldChange[] = [];
    for (const field of watchedFields) {
      const oldValue = Reflect.get(old, field) as unknown;
      const newValue = Reflect.get(milestone, field) as unknown;
      if (!sameValue(oldValue, newValue)) {
        fields.push({ field, before: oldValue ?? null, after: newValue ?? null });
      }
    }
    modified.push({
      ...milestoneSummary(milestone),
      fields,
      ...(fields.length === 0 ? { unwatchedOnly: true } : {}),
    });
  }

  for (const [id, milestone] of previous) {
    if (!current.has(id)) disappeared.push(milestoneSummary(milestone));
  }

  return { added, modified, disappeared };
}

export function foldChanges(documents: ChangeDocument[]): ChangeSet {
  const netFields = new Map<string, Map<string, Required<FieldChange & { hops: number }>>>();
  const metadata = new Map<string, MilestoneSummary>();
  const firstState = new Map<string, "added" | "modified" | "disappeared">();
  const lastState = new Map<string, "added" | "modified" | "disappeared">();
  const unwatchedOnly = new Set<string>();

  for (const document of documents) {
    const recordState = (
      kind: "added" | "modified" | "disappeared",
      record: MilestoneSummary,
    ) => {
      metadata.set(record.id, { ...metadata.get(record.id), ...record });
      if (!firstState.has(record.id)) firstState.set(record.id, kind);
      lastState.set(record.id, kind);
    };

    for (const record of document.added) recordState("added", record);
    for (const record of document.disappeared) recordState("disappeared", record);
    for (const record of document.modified) {
      recordState("modified", record);
        if (record.unwatchedOnly) unwatchedOnly.add(record.id);
        let fieldMap = netFields.get(record.id);
        if (!fieldMap) {
          fieldMap = new Map();
          netFields.set(record.id, fieldMap);
        }
        for (const change of record.fields) {
          const existing = fieldMap.get(change.field);
          if (existing) {
            existing.after = change.after;
            existing.hops += 1;
          } else {
            fieldMap.set(change.field, {
              field: change.field,
              before: change.before,
              after: change.after,
              hops: 1,
            });
          }
        }
    }
  }

  const result: ChangeSet = { added: [], modified: [], disappeared: [], churn: [] };
  for (const [id, state] of lastState) {
    const summary = metadata.get(id) ?? {
      id,
      number: null,
      name: null,
      date: null,
      status: null,
      commitment: null,
      monthlyUse: null,
      ownerName: null,
      accountName: null,
      url: "",
    };
    if (state === "disappeared") {
      result.disappeared.push(summary);
      continue;
    }

    const currentSummary = { ...summary };
    delete currentSummary.gone;
    if (firstState.get(id) === "added") {
      result.added.push(currentSummary);
      continue;
    }

    const fieldMap = netFields.get(id);
    if (!fieldMap?.size) {
      if (
        unwatchedOnly.has(id) ||
        (state === "added" && firstState.get(id) !== "added")
      ) {
        result.modified.push({ ...currentSummary, fields: [], unwatchedOnly: true });
      }
      continue;
    }
    const changed: FieldChange[] = [];
    const churned: FieldChange[] = [];
    for (const field of fieldMap.values()) {
      if (sameValue(field.before, field.after)) churned.push(field);
      else changed.push(field);
    }
    if (changed.length) result.modified.push({ ...currentSummary, fields: changed });
    if (churned.length) result.churn.push({ ...currentSummary, fields: churned });
  }
  return result;
}
