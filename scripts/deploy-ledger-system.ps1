# Redeploy SentinelLedger + wired Vault/Router on existing demo (no pool redeploy).
param(
    [string]$Profile = "monad-testnet",
    [string]$RpcUrl = "",
    [switch]$SkipSyncBackend,
    [switch]$Hybrid = $false,
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$foundryBins = @(
    (Join-Path $env:USERPROFILE ".foundry\bin"),
    (Join-Path $env:LOCALAPPDATA "foundry/bin")
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
Write-Host "Sentinel — redeploy ledger system (SentinelLedger + vault + router)" -ForegroundColor Green

$envFile = Join-Path $RepoRoot "contracts\.env"
if ($Profile -eq "monad-testnet") {
    if (-not (Test-Path $envFile)) {
        throw "Set PRIVATE_KEY in contracts/.env (deployer wallet 0x8819…)."
    }
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^PRIVATE_KEY=(.+)$') {
            $env:PRIVATE_KEY = $Matches[1].Trim().Trim('"').Trim("'")
        }
        if ($line -match '^MONAD_RPC_URL=(.+)$') {
            $env:MONAD_RPC_URL = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    if (-not $env:PRIVATE_KEY) {
        throw "PRIVATE_KEY missing in contracts/.env"
    }
} else {
    Load-DotEnv -Path $envFile
    if (-not $env:PRIVATE_KEY) {
        $env:PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        Write-Host "Using default Anvil deployer key (#0)" -ForegroundColor Yellow
    }
}

$deploymentFile = switch ($Profile) {
    "monad-testnet" { Join-Path $RepoRoot "contracts\deployments\monad-10143-demo.json" }
    "anvil-fork-monad" { Join-Path $RepoRoot "contracts\deployments\local-10143-demo.json" }
    default { Join-Path $RepoRoot "contracts\deployments\local-31337-demo.json" }
}

$patchFile = switch ($Profile) {
    "monad-testnet" { Join-Path $RepoRoot "contracts\deployments\monad-10143-ledger-patch.json" }
    "anvil-fork-monad" { Join-Path $RepoRoot "contracts\deployments\local-10143-ledger-patch.json" }
    default { Join-Path $RepoRoot "contracts\deployments\local-31337-ledger-patch.json" }
}

if (-not $RpcUrl) {
    $RpcUrl = switch ($Profile) {
        "monad-testnet" {
            if ($env:MONAD_RPC_URL) { $env:MONAD_RPC_URL } else { "https://testnet-rpc.monad.xyz" }
        }
        default { "http://127.0.0.1:8545" }
    }
}

Write-Step "Broadcast DeployLedgerSystem ($Profile)"
Write-Host "RPC: $RpcUrl"
Write-Host "Manifest: $deploymentFile"

Push-Location (Join-Path $RepoRoot "contracts")
try {
    $env:DEMO_PROFILE = $Profile
    & forge script script/DeployLedgerSystem.s.sol:DeployLedgerSystem --rpc-url $RpcUrl --broadcast -vvv
    if ($LASTEXITCODE -ne 0) {
        throw "forge deploy failed (exit $LASTEXITCODE)"
    }
} finally {
    Pop-Location
}

if (-not (Test-Path $patchFile)) {
    throw "Patch file missing: $patchFile"
}

Write-Step "Merge patch into manifest"
$manifestJson = Get-Content $deploymentFile -Raw | ConvertFrom-Json
$patch = Get-Content $patchFile -Raw | ConvertFrom-Json
$merged = [ordered]@{}
foreach ($prop in $manifestJson.PSObject.Properties) {
    $merged[$prop.Name] = $prop.Value
}
$merged["ledger"] = $patch.ledger
$merged["vaultExecution"] = $patch.vaultExecution
$merged["swapRouter"] = $patch.swapRouter
$merged["achievements"] = $null
$jsonText = ($merged | ConvertTo-Json -Depth 10) + "`n"
[System.IO.File]::WriteAllText($deploymentFile, $jsonText, [System.Text.UTF8Encoding]::new($false))
Get-Content $deploymentFile -Raw | Write-Host

if (-not $SkipSyncBackend) {
    Write-Step "Sync backend/.env"
    if ($Hybrid) {
        & (Join-Path $RepoRoot "scripts\sync-backend-env.ps1") `
            -RepoRoot $RepoRoot `
            -Profile "monad-testnet" `
            -Hybrid | Out-Null
    } else {
        & (Join-Path $RepoRoot "scripts\sync-backend-env.ps1") `
            -RepoRoot $RepoRoot `
            -Profile $Profile `
            -DeploymentFile $deploymentFile `
            -RpcUrl $RpcUrl | Out-Null
    }
}

Write-Host ""
Write-Host "Done. Restart backend to pick up new ledger / router addresses." -ForegroundColor Green
