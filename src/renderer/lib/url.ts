/** Defensive client-side check only; the main process is the authoritative validator. */
export function isSafeExternalUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
