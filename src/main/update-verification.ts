import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

async function executableInfo(path: string): Promise<{ Status: string; Subject: string | null; Version: string | null }> {
  const windowsPowerShell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0");
  const { stdout, stderr } = await execute(
    join(windowsPowerShell, "powershell.exe"),
    [
      "-NoProfile", "-NonInteractive", "-Command",
      "$ErrorActionPreference = 'Stop'; " +
      "Import-Module \"$PSHOME\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1\"; " +
      "$s = Get-AuthenticodeSignature -LiteralPath $env:CSU_UPDATE_FILE; " +
      "@{ Status = [string]$s.Status; Subject = $s.SignerCertificate.Subject; " +
      "Version = (Get-Item -LiteralPath $env:CSU_UPDATE_FILE).VersionInfo.ProductVersion } | ConvertTo-Json -Compress",
    ],
    {
      windowsHide: true,
      timeout: 30000,
      env: { ...process.env, CSU_UPDATE_FILE: path, PSModulePath: join(windowsPowerShell, "Modules") },
    },
  );
  const info: unknown = JSON.parse(stdout);
  if (stderr || typeof info !== "object" || info === null ||
    !("Status" in info) || typeof info.Status !== "string" ||
    !("Subject" in info) || (typeof info.Subject !== "string" && info.Subject !== null) ||
    !("Version" in info) || (typeof info.Version !== "string" && info.Version !== null)) {
    throw new Error("ERR_UPDATE_INTEGRITY_METADATA");
  }
  return { Status: info.Status, Subject: info.Subject, Version: info.Version };
}

function matchesVersion(actual: string | null, expected: string): boolean {
  return actual === expected || actual === `${expected}.0`;
}

export async function verifyAuthenticode(path: string, publisher: string, version?: string): Promise<void> {
  const signature = await executableInfo(path);
  if (
    signature.Status !== "Valid" || signature.Subject !== publisher ||
    (version !== undefined && !matchesVersion(signature.Version, version))
  ) {
    throw new Error("ERR_UPDATE_INTEGRITY_SIGNATURE");
  }
}

export async function verifyTestInstallerVersion(path: string, version: string): Promise<void> {
  if (!matchesVersion((await executableInfo(path)).Version, version)) {
    throw new Error("ERR_UPDATE_INTEGRITY_VERSION");
  }
}

export async function verifyChecksum(path: string, expected: string): Promise<void> {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest("base64") !== expected) throw new Error("ERR_UPDATE_INTEGRITY_CHECKSUM");
}
