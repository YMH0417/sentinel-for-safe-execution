# Deploy SentinelAchievements + wired Vault/Router on existing Monad demo (no pool redeploy).
param(
    [switch]$SkipSyncBackend,
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
Write-Host "Sentinel — deploy badge system (achievements + vault + router)" -ForegroundColor Green

$envFile = Join-Path $RepoRoot "contracts\.env"
Load-DotEnv -Path $envFile

if (-not $env:PRIVATE_KEY) {
    throw "Set PRIVATE_KEY in contracts/.env (deployer wallet 0x8819…)."
}

$rpcUrl = if ($env:MONAD_RPC_URL) { $env:MONAD_RPC_URL } else { "https://testnet-rpc.monad.xyz" }
$deploymentFile = Join-Path $RepoRoot "contracts\deployments\monad-10143-demo.json"
$patchFile = Join-Path $RepoRoot "contracts\deployments\monad-10143-badge-patch.json"

Write-Step "Broadcast DeployBadgeSystem"
Push-Location (Join-Path $RepoRoot "contracts")
try {
    $env:DEMO_PROFILE = "monad-testnet"
    & forge script script/DeployBadgeSystem.s.sol:DeployBadgeSystem --rpc-url $rpcUrl --broadcast -vvv
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
$merged["achievements"] = $patch.achievements
$merged["vaultExecution"] = $patch.vaultExecution
$merged["swapRouter"] = $patch.swapRouter
($merged | ConvertTo-Json -Depth 10) + "`n" | Set-Content -Encoding utf8 $deploymentFile
Get-Content $deploymentFile -Raw | Write-Host

if (-not $SkipSyncBackend) {
    Write-Step "Sync backend/.env"
    & (Join-Path $RepoRoot "scripts\sync-backend-env.ps1") `
        -RepoRoot $RepoRoot `
        -Profile "monad-testnet" `
        -DeploymentFile $deploymentFile `
        -RpcUrl $rpcUrl | Out-Null
}

Write-Host ""
Write-Host "Done. Update backend env achievements if needed; restart backend." -ForegroundColor Green
