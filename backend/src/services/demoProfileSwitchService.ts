import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { resolveEnvFilePath } from "./llmEnvConfigService.js";
import { clearDemoConfigCache } from "../config/demoConfig.js";
import {
  type DemoProfileName,
  clearDemoProfileCache,
  getDemoProfile,
  isDemoProfileName,
  loadDemoChainProfiles,
  resolveDeploymentPath,
  resolveDeploymentPathForEnv,
} from "../config/demoProfile.js";
import { resetSwapRuntimeCache } from "../config/chainConfig.js";
import { invalidatePoolsHealthCache } from "./poolHealthCacheService.js";
import { invalidatePoolVolumeCache } from "./poolVolumeCacheService.js";
import { clearLiveDemoConfigCache } from "./demoRegistryService.js";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

const ANVIL_DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const DEMO_MANAGED_KEYS = [
  "CHAIN_MODE",
  "DEMO_PROFILE",
  "RPC_URL",
  "DEMO_DEPLOYMENT_PATH",
  "DEMO_REGISTRY_ADDRESS",
  "VAULT_EXECUTION_ADDRESS",
  "DEMO_SWAP_ROUTER_ADDRESS",
  "DEMO_SCENARIO_DEPLOYER",
  "SWAP_PRIVATE_KEY",
  "EXECUTOR_PRIVATE_KEY",
  "AGENT_PRIVATE_KEY",
] as const;

interface DeploymentManifest {
  registry: string;
  vaultExecution: string;
  swapRouter: string;
  scenarioDeployer: string;
  deploymentTarget?: "local" | "remote";
}

export interface DemoProfileListItem {
  name: DemoProfileName;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeSymbol: string;
  deploymentTarget: "local" | "remote";
  manifestPath: string;
  manifestExists: boolean;
  active: boolean;
}

function parseEnvLines(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function readEnvMap(): Map<string, string> {
  const merged = new Map<string, string>();
  const path = resolveEnvFilePath();
  if (existsSync(path)) {
    for (const [k, v] of parseEnvLines(readFileSync(path, "utf-8"))) {
      merged.set(k, v);
    }
  }
  for (const key of DEMO_MANAGED_KEYS) {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) merged.set(key, fromProcess);
  }
  return merged;
}

function mergeDemoEnvFile(updates: Record<string, string | undefined>): void {
  const path = resolveEnvFilePath();
  const originalLines = existsSync(path) ? readFileSync(path, "utf-8").split(/\r?\n/) : [];
  const keysToReplace = new Set<string>(DEMO_MANAGED_KEYS);
  const seen = new Set<string>();
  const output: string[] = [];

  for (const line of originalLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      output.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 1) {
      output.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (!keysToReplace.has(key)) {
      output.push(line);
      continue;
    }
    if (key in updates) {
      seen.add(key);
      const value = updates[key];
      if (value !== undefined && value !== "") {
        output.push(`${key}=${value}`);
      }
    }
  }

  for (const key of DEMO_MANAGED_KEYS) {
    if (seen.has(key)) continue;
    const value = updates[key];
    if (value !== undefined && value !== "") {
      output.push(`${key}=${value}`);
    }
  }

  const body = output.join("\n");
  writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`, "utf-8");
}

function applyDemoEnvToProcess(updates: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (value === "") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function tryLoadContractsPrivateKey(repoRoot: string): string | undefined {
  const path = resolve(repoRoot, "contracts/.env");
  if (!existsSync(path)) return undefined;
  return parseEnvLines(readFileSync(path, "utf-8")).get("PRIVATE_KEY")?.trim();
}

export function listDemoProfiles(): DemoProfileListItem[] {
  const profiles = loadDemoChainProfiles();
  const active = getDemoProfile();
  return (Object.keys(profiles) as DemoProfileName[]).map((name) => {
    const profile = profiles[name];
    const manifestAbs = resolveDeploymentPath(name);
    return {
      name,
      chainId: profile.chainId,
      chainName: profile.chainName,
      rpcUrl: profile.rpcUrl,
      nativeSymbol: profile.nativeCurrency.symbol,
      deploymentTarget: profile.deploymentTarget,
      manifestPath: profile.manifestPath,
      manifestExists: existsSync(manifestAbs),
      active: name === active,
    };
  });
}

export function switchDemoProfile(profileName: string): {
  profile: DemoProfileName;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  deploymentTarget: "local" | "remote";
  warnings: string[];
} {
  if (!isDemoProfileName(profileName)) {
    throw new Error(`Invalid profile "${profileName}"`);
  }

  const manifestPath = resolveDeploymentPath(profileName);
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Deployment manifest not found for profile "${profileName}": ${manifestPath}. ` +
        "Run .\\start-demo.ps1 or deploy first."
    );
  }

  const deployment = JSON.parse(readFileSync(manifestPath, "utf-8")) as DeploymentManifest;
  for (const key of ["registry", "vaultExecution", "swapRouter", "scenarioDeployer"] as const) {
    if (!deployment[key]) {
      throw new Error(`Deployment manifest missing "${key}" in ${manifestPath}`);
    }
  }

  const profile = loadDemoChainProfiles()[profileName];
  const rpcUrl =
    profile.deploymentTarget === "remote"
      ? process.env.MONAD_RPC_URL?.trim() || profile.rpcUrl
      : profile.rpcUrl;

  const isLocal =
    profile.deploymentTarget === "local" || deployment.deploymentTarget === "local";

  const updates: Record<string, string | undefined> = {
    CHAIN_MODE: "demo",
    DEMO_PROFILE: profileName,
    RPC_URL: rpcUrl,
    DEMO_DEPLOYMENT_PATH: resolveDeploymentPathForEnv(profileName),
    DEMO_REGISTRY_ADDRESS: deployment.registry,
    VAULT_EXECUTION_ADDRESS: deployment.vaultExecution,
    DEMO_SWAP_ROUTER_ADDRESS: deployment.swapRouter,
    DEMO_SCENARIO_DEPLOYER: deployment.scenarioDeployer,
  };

  const warnings: string[] = [];
  const existingEnv = readEnvMap();

  if (isLocal) {
    updates.SWAP_PRIVATE_KEY = ANVIL_DEFAULT_PRIVATE_KEY;
    updates.EXECUTOR_PRIVATE_KEY = ANVIL_DEFAULT_PRIVATE_KEY;
    updates.AGENT_PRIVATE_KEY = ANVIL_DEFAULT_PRIVATE_KEY;
  } else {
    updates.SWAP_PRIVATE_KEY = "";
    updates.EXECUTOR_PRIVATE_KEY = "";
    const agentKey =
      existingEnv.get("AGENT_PRIVATE_KEY")?.trim() || tryLoadContractsPrivateKey(REPO_ROOT);
    if (agentKey) {
      updates.AGENT_PRIVATE_KEY = agentKey;
    } else {
      updates.AGENT_PRIVATE_KEY = "";
      warnings.push(
        "未配置 AGENT_PRIVATE_KEY：Safe MetaMask swap 需 Agent 签名。请将 deploy 私钥写入 backend/.env 的 AGENT_PRIVATE_KEY，或保留 contracts/.env 的 PRIVATE_KEY"
      );
    }
  }

  mergeDemoEnvFile(updates);
  applyDemoEnvToProcess(updates);

  clearDemoProfileCache();
  clearDemoConfigCache();
  clearLiveDemoConfigCache();
  resetSwapRuntimeCache();
  invalidatePoolsHealthCache();
  invalidatePoolVolumeCache();

  if (isLocal) {
    warnings.push("本地 profile 需确保 Anvil 在 8545 运行（.\\start-demo.ps1 -Profile " + profileName + "）");
  }

  return {
    profile: profileName,
    chainId: profile.chainId,
    chainName: profile.chainName,
    rpcUrl,
    deploymentTarget: profile.deploymentTarget,
    warnings,
  };
}
