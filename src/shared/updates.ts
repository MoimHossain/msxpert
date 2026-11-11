export const RELEASES_URL = "https://github.com/MoimHossain/msxpert/releases";
export type UpdateVerification = "signed" | "unsigned-test";

export type UpdatePhase =
  | "unsupported"
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "verifying"
  | "ready"
  | "installing"
  | "error";

export interface UpdateRelease {
  version: string;
  publishedAt: string | null;
  notes: string;
  size: number | null;
}

export interface UpdateState {
  verification: UpdateVerification;
  phase: UpdatePhase;
  installedVersion: string;
  release: UpdateRelease | null;
  lastAttemptAt: string | null;
  lastCheckedAt: string | null;
  retryAt: string | null;
  progress: { percent: number; transferred: number; total: number } | null;
  message: string | null;
  outcome: string | null;
}

export interface RestartRequest {
  id: string;
}
