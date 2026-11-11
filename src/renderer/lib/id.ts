/** Generates a client-side id for records the manager creates locally (e.g. a
 * manual team member or a new POD) before the main process persists them. */
export function createLocalId(): string {
  return crypto.randomUUID();
}
