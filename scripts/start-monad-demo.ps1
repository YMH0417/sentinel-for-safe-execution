# Monad testnet demo — no local Anvil (execution + SentinelLedger on chain 10143).
param(
    [switch]$SkipBackendRestart,
    [switch]$SkipFrontendRestart,
    [int]$BackendPort = 8080,
    [int]$FrontendPort = 8081
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Stop-PortListener([int]$Port) {
    netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING" | ForEach-Object {
        $parts = ($_.Line -replace '\s+', ' ').Trim().Split(' ')
        $procId = [int]$parts[-1]
        if ($procId -gt 0) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

function Preserve-EnvTail([string]$EnvPath) {
    if (-not (Test-Path $EnvPath)) { return @() }
    $keep = @()
    Get-Content $EnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^(LLM_|DATABASE_URL=)') { $keep += $_ }
    }
    return $keep
}

function Clear-InheritedDemoEnv {
    $keys = @(
        "DEMO_PROFILE", "DEMO_DEPLOYMENT_PATH", "DEMO_REGISTRY_ADDRESS",
        "DEMO_LEDGER_ADDRESS", "DEMO_HYBRID_MODE", "LEDGER_DEPLOYMENT_PATH",
        "LEDGER_RPC_URL", "SENTINEL_LEDGER_SOURCE", "POOL_VOLUME_SOURCE",
        "RPC_URL", "VAULT_EXECUTION_ADDRESS", "DEMO_SWAP_ROUTER_ADDRESS"
    )
    foreach ($k in $keys) {
        Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue
    }
}

Write-Host "`n==> Monad testnet demo (no Anvil)" -ForegroundColor Cyan

$manifest = Join-Path $RepoRoot "contracts\deployments\monad-10143-demo.json"
if (-not (Test-Path $manifest)) {
    throw "Missing $manifest — run .\scripts\deploy-monad-testnet.ps1 first"
}
$deployment = Get-Content $manifest -Raw | ConvertFrom-Json
if (-not $deployment.ledger) {
    throw "Monad manifest missing ledger — run .\scripts\deploy-ledger-system.ps1 -Profile monad-testnet"
}

$envPath = Join-Path $RepoRoot "backend\.env"
$envTail = Preserve-EnvTail -EnvPath $envPath

& (Join-Path $RepoRoot "scripts\sync-backend-env.ps1") `
    -RepoRoot $RepoRoot `
    -Profile "monad-testnet" | Out-Null

if ($envTail.Count -gt 0) {
    Add-Content -Path $envPath -Value ("`n" + ($envTail -join "`n")) -Encoding ASCII
}

New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "tmp") | Out-Null

if (-not $SkipBackendRestart) {
    Write-Host "Restarting backend on :$BackendPort ..."
    Stop-PortListener -Port $BackendPort
    Start-Sleep -Seconds 1
    Clear-InheritedDemoEnv
    Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev") `
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

if (-not $SkipFrontendRestart) {
    Write-Host "Restarting frontend on :$FrontendPort ..."
    Stop-PortListener -Port $FrontendPort
    Start-Sleep -Seconds 1
    Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev") `
        -WorkingDirectory (Join-Path $RepoRoot "frontend") `
        -RedirectStandardOutput (Join-Path $RepoRoot "tmp\frontend.out.log") `
        -RedirectStandardError (Join-Path $RepoRoot "tmp\frontend.err.log") -WindowStyle Hidden
}

$status = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/debug/status" -TimeoutSec 10

Write-Host @"

Monad demo ready (no Anvil)
  Chain              : Monad Testnet ($($status.expectedChainId))
  RPC                : $($status.demoRpcUrl)
  SentinelLedger     : $($deployment.ledger)
  Router             : $($deployment.swapRouter)
  Backend            : http://127.0.0.1:$BackendPort
  Frontend           : http://127.0.0.1:$FrontendPort
  MetaMask           : switch to Monad Testnet (10143)

"@ -ForegroundColor Green
