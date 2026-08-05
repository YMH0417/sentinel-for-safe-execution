import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repo root (sentinel-for-safe-execution/). */
export function getRepoRoot(): string {
  return path.resolve(__dirname, "../../..");
}

/** Resolve a manifest or data path for local dev, Vercel, or backend cwd. */
export function resolveRepoFilePath(input: string): string {
  const trimmed = input.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\\/g, "/");
  const repoRoot = getRepoRoot();
  const candidates = [
    path.resolve(process.cwd(), trimmed),
    path.resolve(repoRoot, normalized),
    path.resolve(repoRoot, normalized.replace(/^\.\.\//, "")),
    path.resolve(repoRoot, "backend", normalized),
    path.resolve(repoRoot, "contracts/deployments", path.basename(normalized)),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(repoRoot, normalized.replace(/^\.\.\//, ""));
}
