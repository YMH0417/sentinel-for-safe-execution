import { neon, Pool, type NeonQueryFunction } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getDatabaseUrl } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let sql: NeonQueryFunction<boolean, boolean> | null = null;
let schemaReady: Promise<void> | null = null;

export function getSql(): NeonQueryFunction<boolean, boolean> {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is required for postgres storage");
  }
  if (!sql) {
    sql = neon(url);
  }
  return sql;
}

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const url = getDatabaseUrl();
      if (!url) {
        throw new Error("DATABASE_URL is required for postgres storage");
      }
      const ddl = readFileSync(join(__dirname, "schema.sql"), "utf-8");
      const statements = ddl
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));
      const pool = new Pool({ connectionString: url });
      try {
        for (const statement of statements) {
          await pool.query(statement);
        }
      } finally {
        await pool.end();
      }
    })();
  }
  await schemaReady;
}

export async function initPostgresStorage(): Promise<void> {
  await ensureSchema();
}
