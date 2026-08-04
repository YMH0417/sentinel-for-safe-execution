# Hybrid demo: Monad testnet execution + Anvil ledger (seeded mock data)
param(
    [switch]$SkipAnvilDeploy,
    [switch]$RedeployAnvil,
    [switch]$SkipSeed,
    [switch]$SkipBackendRestart,
    [int]$AnvilPort = 8545,
    [int]$BackendPort = 8080
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$AnvilKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

$foundryBins = @(
    (Join-Path $env:USERPROFILE ".foundry\bin"),
    (Join-Path $env:LOCALAPPDATA "foundry\bin")
)
foreach ($bin in $foundryBins) {
    if (Test-Path $bin) { $env:PATH = "$bin;$env:PATH" }
}

function Stop-PortListener([int]$Port) {
    netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING" | ForEach-Object {
        $parts = ($_.Line -replace '\s+', ' ').Trim().Split(' ')
        $procId = [int]$parts[-1]
        if ($procId -gt 0) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "`n==> Hybrid demo: Monad execution + Anvil data ledger" -ForegroundColor Cyan

# 1) Ensure Anvil running
$rpcUrl = "http://127.0.0.1:$AnvilPort"
$body = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
$anvilUp = $false
try {
    $resp = Invoke-RestMethod -Uri $rpcUrl -Method POST -Body $body -ContentType "application/json" -TimeoutSec 2
    if ($resp.result -eq "0x7a69") { $anvilUp = $true }
} catch { }

if (-not $anvilUp) {
    Write-Host "Starting Anvil on $rpcUrl ..."
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "tmp") | Out-Null
    Start-Process -FilePath "anvil" -ArgumentList @("--chain-id", "31337", "--port", "$AnvilPort", "--block-gas-limit", "120000000") `
        -RedirectStandardOutput (Join-Path $RepoRoot "tmp\anvil.out.log") `
        -RedirectStandardError (Join-Path $RepoRoot "tmp\anvil.err.log") -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# 2) Deploy Anvil contracts if needed (or forced redeploy after ledger upgrade)
$anvilManifest = Join-Path $RepoRoot "contracts\deployments\local-31337-demo.json"
if ($RedeployAnvil) {
    Remove-Item $anvilManifest -Force -ErrorAction SilentlyContinue
}
if (-not $SkipAnvilDeploy -and -not (Test-Path $anvilManifest)) {
    Write-Host "Deploying Anvil demo (SentinelLedger) ..."
    Push-Location (Join-Path $RepoRoot "contracts")
    $env:PRIVATE_KEY = $AnvilKey
    $env:DEMO_PROFILE = "anvil-local"
    cmd /c "forge script script/DeployAllDemo.s.sol:DeployAllDemo --rpc-url $rpcUrl --broadcast -vv > ..\tmp\forge-deploy.log 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Get-Content (Join-Path $RepoRoot "tmp\forge-deploy.log") -Tail 30
        Pop-Location
        throw "Anvil deploy failed (exit $LASTEXITCODE)"
    }
    Pop-Location
}

$anvil = Get-Content $anvilManifest -Raw | ConvertFrom-Json

# 3) Seed Anvil ledger mock stats
if (-not $SkipSeed) {
    Write-Host "Seeding Anvil SentinelLedger mock data ..."
    Push-Location (Join-Path $RepoRoot "contracts")
    $env:PRIVATE_KEY = $AnvilKey
    $env:DEMO_LEDGER_ADDRESS = $anvil.ledger
    $env:USDC_ADDRESS = $anvil.tokens.USDC
    $env:SEED_SAFE_TRADE_COUNT = "8"
    cmd /c "forge script script/SeedAnvilLedger.s.sol --rpc-url $rpcUrl --broadcast -vv > ..\tmp\forge-seed.log 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        throw "SeedAnvilLedger failed (exit $LASTEXITCODE)"
    }
    Pop-Location
}

# 4) Sync hybrid backend .env (Monad execution + Anvil ledger)
Write-Host "Writing hybrid backend/.env ..."
& (Join-Path $RepoRoot "scripts\sync-backend-env.ps1") `
    -RepoRoot $RepoRoot `
    -Profile monad-testnet `
    -Hybrid `
    -AnvilPrivateKey $AnvilKey | Out-Null

# 5) Reset local JSON ledger (baseline re-seeded on backend start)
$ledgerFile = Join-Path $RepoRoot "backend\data\trade-ledger.json"
@'
{
  "version": 2,
  "users": {},
  "trades": [],
  "checkedTrades": {},
  "txIndex": {}
}
'@ | Set-Content -Path $ledgerFile -Encoding ASCII

# 6) Restart backend
if (-not $SkipBackendRestart) {
    Write-Host "Restarting backend on :$BackendPort ..."
    Stop-PortListener -Port $BackendPort
    Start-Sleep -Seconds 1
    $npm = (Get-Command npm.cmd).Source
    Start-Process -FilePath $npm -ArgumentList @("run", "dev") `
        -WorkingDirectory (Join-Path $RepoRoot "backend") `
        -RedirectStandardOutput (Join-Path $RepoRoot "tmp\backend.out.log") `
        -RedirectStandardError (Join-Path $RepoRoot "tmp\backend.err.log") -WindowStyle Hidden
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $h = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/health" -TimeoutSec 2
            if ($h.status -eq "ok") { break }
        } catch { Start-Sleep 1 }
    }
}

$monadManifest = Join-Path $RepoRoot "contracts\deployments\monad-10143-demo.json"
$monad = Get-Content $monadManifest -Raw | ConvertFrom-Json
$status = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/debug/status" -TimeoutSec 5

Write-Host @"

Hybrid demo ready
  Execution (Monad)  : $($status.demoRpcUrl)  chainId $($status.expectedChainId)
  Data ledger (Anvil)  : $($status.ledgerRpcUrl)  ledger $($anvil.ledger)
  Backend              : http://127.0.0.1:$BackendPort
  Frontend             : http://127.0.0.1:8081
  MetaMask             : switch to Monad Testnet (10143) for wallet swaps

  Router (Monad)       : $($monad.swapRouter)
  Test user            : $($anvil.testUser)

"@ -ForegroundColor Green
