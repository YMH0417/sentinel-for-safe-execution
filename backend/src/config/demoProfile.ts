import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";

export type DemoProfileName = "anvil-local" | "anvil-fork-monad" | "monad-testnet";
export type DeploymentTarget = "local" | "remote";

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface DemoChainProfile {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeCurrency: NativeCurrency;
  manifestPath: string;
  deploymentTarget: DeploymentTarget;
  forkUrl?: string;
}

type DemoChainProfilesFile = Record<DemoProfileName, DemoChainProfile>;

const VALID_PROFILES: DemoProfileName[] = [
  "anvil-local",
  "anvil-fork-monad",
  "monad-testnet",
];

const DEFAULT_PROFILE: DemoProfileName = "anvil-local";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "../../..");
const profilesFilePath = path.join(__dirname, "demo-chain-profiles.json");
const profilesFileFallback = path.join(repoRoot, "shared/demo-chain-profiles.json");

/** Legacy manifest kept until Step 2 migration completes. */
const legacyDeploymentPath = path.join(
  repoRoot,
  "contracts/deployments/anvil-31337-demo.json"
);

let cachedProfiles: DemoChainProfilesFile | null = null;

export class DemoProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoProfileError";
  }
}

export function getDemoProfile(): DemoProfileName {
  const raw = process.env.DEMO_PROFILE?.trim();
  if (!raw) return DEFAULT_PROFILE;
  if (!isDemoProfileName(raw)) {
    throw new DemoProfileError(
      `Invalid DEMO_PROFILE "${raw}". Expected: ${VALID_PROFILES.join(", ")}`
    );
  }
  return raw;
}

export function isDemoProfileName(value: string): value is DemoProfileName {
  return VALID_PROFILES.includes(value as DemoProfileName);
}

export function loadDemoChainProfiles(): DemoChainProfilesFile {
  if (cachedProfiles) return cachedProfiles;

  const resolvedPath = fs.existsSync(profilesFilePath)
    ? profilesFilePath
    : profilesFileFallback;

  if (!fs.existsSync(resolvedPath)) {
    throw new DemoProfileError(`Demo chain profiles file not found: ${resolvedPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf-8")) as DemoChainProfilesFile;
  for (const name of VALID_PROFILES) {
    if (!parsed[name]) {
      throw new DemoProfileError(`Demo chain profiles missing entry: ${name}`);
    }
  }

  cachedProfiles = parsed;
  return cachedProfiles;
}

export function getDemoChainProfile(profileName?: DemoProfileName): DemoChainProfile {
  const name = profileName ?? getDemoProfile();
  const profiles = loadDemoChainProfiles();
  return profiles[name];
}

/** Alias for plan/docs compatibility. */
export const loadDemoChainProfile = getDemoChainProfile;

/** Absolute path to the deployment manifest for a profile. */
export function resolveDeploymentPath(profileName?: DemoProfileName): string {
  const profile = getDemoChainProfile(profileName);
  return path.resolve(repoRoot, profile.manifestPath);
}

/** Default manifest path: profile-driven, with legacy fallbacks if present. */
export function resolveDefaultDeploymentPath(): string {
  const profilePath = resolveDeploymentPath();
  if (fs.existsSync(profilePath)) {
    return profilePath;
  }
  const legacyPaths = [
    path.join(repoRoot, "contracts/deployments/local-10143-demo.json"),
    legacyDeploymentPath,
  ];
  for (const legacy of legacyPaths) {
    if (fs.existsSync(legacy)) {
      console.warn(
        `[demoProfile] Using legacy deployment manifest: ${legacy}. ` +
          "Re-run .\\start-demo.ps1 -Profile anvil-local to refresh."
      );
      return legacy;
    }
  }
  return profilePath;
}

/** Repo-relative path suitable for backend/.env DEMO_DEPLOYMENT_PATH. */
export function resolveDeploymentPathForEnv(profileName?: DemoProfileName): string {
  const profile = getDemoChainProfile(profileName);
  return path.join("..", profile.manifestPath.replace(/\\/g, "/"));
}

export function clearDemoProfileCache(): void {
  cachedProfiles = null;
}
