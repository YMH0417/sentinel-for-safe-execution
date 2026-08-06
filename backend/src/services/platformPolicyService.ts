import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { usePostgresStorage } from "../storage/config.js";
import { getSql } from "../storage/db.js";

export interface PlatformPolicy {
  multisigSimEnabled: boolean;
  blockBadToken: boolean;
}

const POLICY_KEY = "platform_policy";
const DEFAULT_POLICY: PlatformPolicy = {
  multisigSimEnabled: false,
  blockBadToken: false,
};

let cachedPolicy: PlatformPolicy | null = null;

function policyFilePath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = resolve(__filename, "..");
  const candidates = [
    resolve(__dirname, "../config/platform-policy.json"),
    resolve(process.cwd(), "backend/src/config/platform-policy.json"),
    resolve(process.cwd(), "src/config/platform-policy.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[0];
}

function normalizePolicy(raw: Partial<PlatformPolicy> | null | undefined): PlatformPolicy {
  const multisigSimEnabled = Boolean(raw?.multisigSimEnabled);
  return {
    multisigSimEnabled,
    blockBadToken: multisigSimEnabled && Boolean(raw?.blockBadToken),
  };
}

function readPolicyFromFile(): PlatformPolicy {
  try {
    const path = policyFilePath();
    if (!existsSync(path)) return { ...DEFAULT_POLICY };
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<PlatformPolicy>;
    return normalizePolicy(parsed);
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

function writePolicyToFile(policy: PlatformPolicy): void {
  try {
    writeFileSync(policyFilePath(), `${JSON.stringify(policy, null, 2)}\n`, "utf-8");
  } catch {
    /* ephemeral FS on serverless — in-memory still applies for warm instances */
  }
}

async function readPolicyFromPostgres(): Promise<PlatformPolicy | null> {
  if (!usePostgresStorage()) return null;
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT value FROM app_settings WHERE key = ${POLICY_KEY} LIMIT 1
    `) as Array<{ value?: Partial<PlatformPolicy> }>;
    const row = rows[0];
    if (!row?.value) return null;
    return normalizePolicy(row.value);
  } catch {
    return null;
  }
}

async function writePolicyToPostgres(policy: PlatformPolicy): Promise<void> {
  if (!usePostgresStorage()) return;
  try {
    const sql = getSql();
    await sql`
      INSERT INTO app_settings (key, value, updated_at_ms)
      VALUES (${POLICY_KEY}, ${JSON.stringify(policy)}::jsonb, ${Date.now()})
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at_ms = EXCLUDED.updated_at_ms
    `;
  } catch {
    /* fall back to file/memory only */
  }
}

export async function getPlatformPolicy(): Promise<PlatformPolicy> {
  if (cachedPolicy) return cachedPolicy;
  const fromDb = await readPolicyFromPostgres();
  cachedPolicy = fromDb ?? readPolicyFromFile();
  return cachedPolicy;
}

export function getPlatformPolicySync(): PlatformPolicy {
  return cachedPolicy ?? readPolicyFromFile();
}

export async function updatePlatformPolicy(
  input: Partial<PlatformPolicy>
): Promise<PlatformPolicy> {
  const current = await getPlatformPolicy();
  const next = normalizePolicy({ ...current, ...input });
  if (!next.multisigSimEnabled) {
    next.blockBadToken = false;
  }
  cachedPolicy = next;
  writePolicyToFile(next);
  await writePolicyToPostgres(next);
  return next;
}

export function checkPlatformPolicyBlock(
  route: { tokenIn: string; tokenOut: string },
  policy: PlatformPolicy
): { reason: string; flag: "bad_token_blocked" } | null {
  if (!policy.multisigSimEnabled || !policy.blockBadToken) return null;

  const tokenOut = route.tokenOut.toUpperCase();
  const tokenIn = route.tokenIn.toUpperCase();
  const symbol = tokenIn === "BAD" ? "BAD" : tokenOut === "BAD" ? "BAD" : null;
  if (!symbol) return null;

  return {
    flag: "bad_token_blocked",
    reason: `${symbol} 代币已锁定多签，无法转出。`,
  };
}
