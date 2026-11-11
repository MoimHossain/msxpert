import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync, gunzipSync } from "node:zlib";
import { safeStorage } from "electron";

interface KeyFile {
  version: 1;
  protectedKey: string;
}

function atomicWrite(path: string, data: Buffer): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, data);
  renameSync(temporary, path);
}

function loadOrCreateKey(dataDirectory: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Windows data protection is unavailable. CSU Console cannot open its encrypted data store.",
    );
  }
  const keyPath = join(dataDirectory, "vault-key.json");
  try {
    const stored = JSON.parse(readFileSync(keyPath, "utf8")) as KeyFile;
    if (stored.version !== 1 || !stored.protectedKey) throw new Error("Unsupported key file.");
    return Buffer.from(
      safeStorage.decryptString(Buffer.from(stored.protectedKey, "base64")),
      "base64",
    );
  } catch (error) {
    if (error instanceof Error && !("code" in error && error.code === "ENOENT")) throw error;
  }

  const key = randomBytes(32);
  const protectedKey = safeStorage.encryptString(key.toString("base64"));
  const file: KeyFile = { version: 1, protectedKey: protectedKey.toString("base64") };
  atomicWrite(keyPath, Buffer.from(`${JSON.stringify(file, null, 2)}\n`, "utf8"));
  return key;
}

function encrypt(key: Buffer, value: unknown): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const clear = gzipSync(Buffer.from(JSON.stringify(value), "utf8"));
  const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([1]), iv, tag, encrypted]);
}

function decrypt<T>(key: Buffer, payload: Buffer): T {
  const version = payload[0];
  if (version !== 1) throw new Error(`Unsupported encrypted payload version ${String(version)}.`);
  const iv = payload.subarray(1, 13);
  const tag = payload.subarray(13, 29);
  const encrypted = payload.subarray(29);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const clear = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(gunzipSync(clear).toString("utf8")) as T;
}

export class VaultStore {
  private readonly database: DatabaseSync;
  private readonly key: Buffer;

  constructor(readonly dataDirectory: string) {
    mkdirSync(dataDirectory, { recursive: true });
    this.key = loadOrCreateKey(dataDirectory);
    if (this.key.length !== 32) throw new Error("The protected data key is invalid.");
    this.database = new DatabaseSync(join(dataDirectory, "portfolio.db"));
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA synchronous = FULL");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS vault_records (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        payload BLOB NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (kind, id)
      );
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '1');
    `);
    const check = this.database.prepare("PRAGMA quick_check").get() as
      | Record<string, unknown>
      | undefined;
    const integrity = check ? String(Object.values(check)[0]) : "unknown";
    if (integrity !== "ok") throw new Error(`Local database integrity check failed: ${integrity}`);
  }

  close(): void {
    this.key.fill(0);
    this.database.close();
  }

  get<T>(kind: string, id: string): T | null {
    const row = this.database
      .prepare("SELECT payload FROM vault_records WHERE kind = ? AND id = ?")
      .get(kind, id) as { payload: Buffer } | undefined;
    return row ? decrypt<T>(this.key, row.payload) : null;
  }

  put(kind: string, id: string, value: unknown): void {
    this.database
      .prepare(`
        INSERT INTO vault_records (kind, id, payload, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(kind, id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `)
      .run(kind, id, encrypt(this.key, value), new Date().toISOString());
  }

  delete(kind: string, id: string): void {
    this.database
      .prepare("DELETE FROM vault_records WHERE kind = ? AND id = ?")
      .run(kind, id);
  }

  deleteKind(kind: string): void {
    this.database.prepare("DELETE FROM vault_records WHERE kind = ?").run(kind);
  }

  list<T>(kind: string): T[] {
    const rows = this.database
      .prepare("SELECT id, payload FROM vault_records WHERE kind = ? ORDER BY id")
      .all(kind);
    return rows.map((row) => {
      if (!(row.payload instanceof Uint8Array)) {
        throw new Error("The encrypted database contains an invalid payload.");
      }
      return decrypt<T>(this.key, Buffer.from(row.payload));
    });
  }

  listEntries<T>(kind: string): Array<{ id: string; value: T }> {
    const rows = this.database
      .prepare("SELECT id, payload FROM vault_records WHERE kind = ? ORDER BY id")
      .all(kind);
    return rows.map((row) => {
      if (!(row.payload instanceof Uint8Array)) {
        throw new Error("The encrypted database contains an invalid payload.");
      }
      return {
        id: String(row.id),
        value: decrypt<T>(this.key, Buffer.from(row.payload)),
      };
    });
  }

  transaction<T>(action: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
