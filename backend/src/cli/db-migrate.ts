import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), ".env") });

import { initPostgresStorage } from "../storage/db.js";
import { getStorageDriver } from "../storage/config.js";

async function main(): Promise<void> {
  const driver = getStorageDriver();
  if (driver !== "postgres") {
    console.log(`STORAGE_DRIVER=${driver} — no Postgres migration needed.`);
    console.log("Set DATABASE_URL (and optionally STORAGE_DRIVER=postgres) to migrate Neon.");
    return;
  }
  await initPostgresStorage();
  console.log("Neon schema applied (idempotent).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
