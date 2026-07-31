# Deploy Sentinel demo to Monad testnet (chain ID 10143).
# Uses the same phased DeployAllDemo script as Anvil — each tx stays under 30M gas.
param(
    [switch]$SkipSyncBackend,
    [switch]$Verify,
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$foundryBins = @(
    (Join-Path $env:USERPROFILE ".foundry\bin"),
    (Join-Path $env:LOCALAPPDATA "foundry\bin")
)
foreach ($bin in $foundryBins) {
    if (Test-Path $bin) {
        $env:PATH = "$bin;$env:PATH"
    }
}

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Load-DotEnv([string]$Path) {
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        if (-not $key) { return }
        $current = [Environment]::GetEnvironmentVariable($key)
        if ([string]::IsNullOrEmpty($current)) {
            Set-Item -Path "env:$key" -Value $val
        }
    }
}

Write-Host ""
Write-Host "Sentinel Demo — Monad testnet deploy (phased, <=30M gas/tx)" -ForegroundColor Green
Write-Host "Repo: $RepoRoot"

Write-Step "Checking prerequisites"
if (-not (Test-Command "forge")) {
    throw "Foundry 'forge' not found. Install: https://book.getfoundry.sh/getting-started/installation"
}

$envFile = Join-Path $RepoRoot "contracts\.env"
Load-DotEnv -Path $envFile

if (-not $env:PRIVATE_KEY) {
    throw "Set PRIVATE_KEY in contracts/.env (never commit real keys)."
}

$rpcUrl = if ($env:MONAD_RPC_URL) { $env:MONAD_RPC_URL } else { "https://testnet-rpc.monad.xyz" }
$deploymentFile = Join-Path $RepoRoot "contracts\deployments\monad-10143-demo.json"

Write-Step "Deploying to Monad testnet"
Write-Host "RPC: $rpcUrl"
Write-Host "Manifest: $deploymentFile"
Write-Host ""
Write-Host "Expected broadcast txs (~17):"
Write-Host "  1x DemoScenarioDeployer"
Write-Host "  1x beginScenario"
Write-Host "  4x deployPoolBatch(12)  [each ~16-18M gas]"
Write-Host "  1x sealScenario"
Write-Host "  1x VaultExecution + 1x DemoSwapRouter + auth + fund test user"

Push-Location (Join-Path $RepoRoot "contracts")
try {
    $forgeArgs = @(
        "script", "script/DeployAllDemo.s.sol:DeployAllDemo",
        "--rpc-url", $rpcUrl,
        "--broadcast",
        "-vvv"
    )
    if ($env:MONADSCAN_API_KEY) {
        $forgeArgs += @("--verify", "--etherscan-api-key", $env:MONADSCAN_API_KEY)
    }
    & forge @forgeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "forge deploy failed (exit $LASTEXITCODE)"
    }
} finally {
    Pop-Location
}

if (-not (Test-Path $deploymentFile)) {
    throw "Deploy finished but manifest missing: $deploymentFile"
}

Write-Step "Deployment complete"
Get-Content $deploymentFile -Raw | Write-Host

if (-not $SkipSyncBackend) {
    Write-Step "Writing backend/.env from Monad manifest"
    & (Join-Path $RepoRoot "scripts\sync-backend-env.ps1") `
        -RepoRoot $RepoRoot `
        -DeploymentFile $deploymentFile `
        -RpcUrl $rpcUrl | Out-Null
    Write-Host "Set SWAP/EXECUTOR/AGENT private keys in backend/.env for your Monad wallet."
}

if ($Verify) {
    Write-Step "On-chain swap verification"
    Push-Location (Join-Path $RepoRoot "contracts")
    try {
        & forge script script/Verify36SwapsDeployed.s.sol:Verify36SwapsDeployed --rpc-url $rpcUrl -vvv
    } finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "Done. Manifest: contracts/deployments/monad-10143-demo.json" -ForegroundColor Green
