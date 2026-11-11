export const APP_NAME = "MCAPS Console";
export const LEGACY_APP_NAME = "CSU Console";
export const INSTALLER_PREFIX = "MCAPS-Console-Setup";
export const LEGACY_INSTALLER_PREFIX = "CSU-Console-Setup";

export function installerNames(version: string): string[] {
  return [INSTALLER_PREFIX, LEGACY_INSTALLER_PREFIX].map((prefix) => `${prefix}-${version}.exe`);
}
