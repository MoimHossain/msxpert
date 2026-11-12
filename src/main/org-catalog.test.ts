import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { MAX_CATALOG_BYTES, parseOrgCatalog, readOrgCatalog } from "./org-catalog";

const person = (overrides = {}) => ({
  id: "directory-only-id", displayName: "Synthetic Example", userPrincipalName: "PERSON@example.test",
  jobTitle: "Example title", org: "ISD", department: "Ignored", managerName: "Not retained", ...overrides,
});
const catalog = (people = [person()]) => ({ generatedAt: "2026-10-01T10:00:00Z", people });

describe("organization catalog import format", () => {
  it("accepts the source catalog and a minimal share file, retaining only necessary data and evidence age", () => {
    const parsed = parseOrgCatalog(`\uFEFF${JSON.stringify({ ...catalog(), roots: [], index: { ignored: "private metadata" } })}`);
    expect(parsed).toEqual({ generatedAt: "2026-10-01T10:00:00.000Z",
      people: [{ name: "Synthetic Example", upn: "person@example.test", jobTitle: "Example title", org: "ISD" }] });
    expect(parseOrgCatalog(JSON.stringify(catalog([person({ userPrincipalName: null, mail: "mail@example.test", jobTitle: null })]))).people[0])
      .toMatchObject({ upn: "mail@example.test", jobTitle: "" });
  });

  it.each([
    "{invalid", JSON.stringify({ ...catalog(), generatedAt: "yesterday" }),
    JSON.stringify(catalog([person({ org: "Invented" })])),
    JSON.stringify(catalog([person({ userPrincipalName: "invalid", mail: "valid@example.test" })])),
    JSON.stringify(catalog([person(), person({ userPrincipalName: "person@example.test" })])),
  ])("rejects malformed or conflicting data before any records can be imported", input => {
    expect(() => parseOrgCatalog(input)).toThrow();
  });

  it("bounds file reads and accepts ordinary UTF-8 catalog files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mcaps-catalog-test-"));
    try {
      const file = join(directory, "catalog.json");
      await writeFile(file, JSON.stringify(catalog()));
      expect((await readOrgCatalog(file)).people[0]?.org).toBe("ISD");
      await writeFile(file, Buffer.alloc(MAX_CATALOG_BYTES + 1));
      await expect(readOrgCatalog(file)).rejects.toThrow("10 MiB");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
