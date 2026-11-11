/** Visual tone used by the Badge component. Never carries meaning through color alone. */
export type Tone = "neutral" | "positive" | "warning" | "critical" | "info";

export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case "On Track":
      return "positive";
    case "At Risk":
      return "warning";
    case "Blocked":
      return "critical";
    case "Completed":
      return "neutral";
    case "Cancelled":
    case "Lost to Competitor":
      return "neutral";
    default:
      return "info";
  }
}

export function commitmentTone(commitment: string | null | undefined): Tone {
  if (commitment === "Committed") return "positive";
  if (commitment === "Upside") return "info";
  if (commitment === "Uncommitted") return "neutral";
  return "neutral";
}

export function runTone(ok: boolean | null | undefined): Tone {
  return ok ? "positive" : "critical";
}
