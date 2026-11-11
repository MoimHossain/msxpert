import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyAuthenticode, verifyChecksum, verifyTestInstallerVersion } from "./update-verification";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "csu-update-verification-"));
  directories.push(directory);
  const path = join(directory, "unsigned.exe");
  writeFileSync(path, "unsigned test installer");
  return path;
}

describe("installer verification", () => {
  it("rejects changed bytes even when a file was previously cached", async () => {
    const path = fixture();
    const checksum = createHash("sha512").update("unsigned test installer").digest("base64");
    await expect(verifyChecksum(path, checksum)).resolves.toBeUndefined();
    writeFileSync(path, "changed");
    await expect(verifyChecksum(path, checksum)).rejects.toThrow("CHECKSUM");
  });

  it.skipIf(process.platform !== "win32")("rejects an unsigned file using Windows Authenticode", async () => {
    await expect(verifyAuthenticode(fixture(), "CN=Approved Publisher")).rejects.toThrow("SIGNATURE");
  }, 40000);

  it.skipIf(process.platform !== "win32")("still requires a matching embedded version for unsigned test installers", async () => {
    await expect(verifyTestInstallerVersion(fixture(), "0.4.0-alpha.1")).rejects.toThrow("VERSION");
  }, 40000);
});
