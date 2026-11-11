import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { LEGACY_APP_NAME } from "../shared/branding";

const schema = z.object({
  tenant: z.string().regex(/^[a-zA-Z0-9.-]+$/),
  clientId: z.guid(),
  resourceUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash;
  }, "The MSX resource must be an HTTPS origin."),
  appId: z.guid(),
});

export type ConnectionConfig = z.infer<typeof schema>;

export function loadConnectionConfig(dataDirectory = join(process.env.LOCALAPPDATA ?? homedir(), LEGACY_APP_NAME)): ConnectionConfig {
  const bundled = JSON.parse(readFileSync(join(__dirname, "..", "..", "msx-connection.json"), "utf8")) as unknown;
  const local = join(dataDirectory, "connection.json");
  const values: unknown = existsSync(local) ? JSON.parse(readFileSync(local, "utf8")) : bundled;
  return schema.parse(values);
}
