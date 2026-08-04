/** Product DB driver — same locally and on Vercel (Neon). */
export type StorageDriver = "postgres" | "file";

export function getStorageDriver(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (explicit === "file" || explicit === "postgres") {
    return explicit;
  }
  if (process.env.DATABASE_URL?.trim()) {
    return "postgres";
  }
  return "file";
}

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
}

export function usePostgresStorage(): boolean {
  return getStorageDriver() === "postgres";
}
