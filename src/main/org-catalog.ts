import { open } from "node:fs/promises";
import { z } from "zod";
import { ORG_UNITS, type OrgUnit } from "../shared/organization";

export const MAX_CATALOG_BYTES = 10 * 1024 * 1024;
const MAX_CATALOG_PEOPLE = 20_000;
const address = z.email().max(500);
const recordSchema = z.object({
  displayName: z.string().trim().min(1).max(300),
  userPrincipalName: z.string().trim().nullish(),
  mail: z.string().trim().nullish(),
  jobTitle: z.string().trim().max(500).nullish(),
  org: z.enum(ORG_UNITS),
});
const envelopeSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  people: z.array(z.unknown()).min(1).max(MAX_CATALOG_PEOPLE),
});

export interface OrgCatalog {
  generatedAt: string;
  people: Array<{ name: string; upn: string; jobTitle: string; org: OrgUnit }>;
}

export function parseOrgCatalog(text: string): OrgCatalog {
  if (Buffer.byteLength(text, "utf8") > MAX_CATALOG_BYTES) throw new Error("Organization catalog exceeds the 10 MiB limit.");
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new Error("Organization catalog is not valid JSON."); }
  const envelope = envelopeSchema.safeParse(value);
  if (!envelope.success) {
    throw new Error("Organization catalog requires a valid generatedAt timestamp and between 1 and 20,000 people.");
  }
  const seen = new Set<string>();
  const people = envelope.data.people.map((input, index) => {
    const parsed = recordSchema.safeParse(input);
    if (!parsed.success) throw new Error(`Catalog person ${index + 1} has an invalid name, title or organization unit.`);
    const person = parsed.data;
    const parsedAddress = address.safeParse(person.userPrincipalName || person.mail);
    if (!parsedAddress.success) throw new Error(`Catalog person ${index + 1} has no valid exact work UPN or email.`);
    const upn = parsedAddress.data.toLowerCase();
    if (seen.has(upn)) throw new Error(`Catalog person ${index + 1} duplicates an earlier work address; nothing was imported.`);
    seen.add(upn);
    return { name: person.displayName, upn, jobTitle: person.jobTitle ?? "", org: person.org };
  });
  return { generatedAt: new Date(envelope.data.generatedAt).toISOString(), people };
}

export async function readOrgCatalog(path: string): Promise<OrgCatalog> {
  const file = await open(path, "r").catch(() => {
    throw new Error("The selected organization catalog could not be opened. Check the file is available and readable.");
  });
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_CATALOG_BYTES) throw new Error("Choose a JSON file no larger than 10 MiB.");
    const buffer = Buffer.alloc(MAX_CATALOG_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_CATALOG_BYTES) throw new Error("Organization catalog exceeds the 10 MiB limit.");
    return parseOrgCatalog(buffer.subarray(0, length).toString("utf8"));
  } finally { await file.close(); }
}
