import { getStorageDriver, usePostgresStorage } from "./config.js";
import { initPostgresStorage } from "./db.js";
import { getEventsRepository } from "./eventsRepository.js";
import { getLedgerRepository } from "./ledgerRepository.js";

export async function initStorage(): Promise<void> {
  if (usePostgresStorage()) {
    await initPostgresStorage();
  }
  await getLedgerRepository();
  await getEventsRepository();
}

export function getStorageInfo(): {
  driver: ReturnType<typeof getStorageDriver>;
  postgres: boolean;
} {
  return {
    driver: getStorageDriver(),
    postgres: usePostgresStorage(),
  };
}

export { getStorageDriver, usePostgresStorage } from "./config.js";
