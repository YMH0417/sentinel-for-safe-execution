# Sentinel Demo — Windows one-click: Anvil + deploy + sync .env + backend (+ optional frontend)
param(
    [switch]$SkipDeploy,
    [switch]$SkipFrontend,
    [switch]$SkipInstall,
    [switch]$VerifySwaps,
    [int]$AnvilPort = 8545,
    [int]$BackendPort = 8080,
    [int]$FrontendPort = 8081
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RpcUrl = "http://127.0.0.1:$AnvilPort"
$AnvilKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Foundry default install locations (Windows)
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

function Wait-Rpc([string]$Url, [int]$MaxSeconds = 45) {
    $body = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
    for ($i = 0; $i -lt $MaxSeconds; $i++) {
        try {
            $resp = Invoke-RestMethod -Uri $Url -Method POST -Body $body -ContentType "application/json" -TimeoutSec 2
            if ($resp.result) { return $true }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

function Get-NpmPath {
    $npmCmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
    if ($npmCmd) { return $npmCmd.Source }
    $npm = Get-Command "npm" -ErrorAction SilentlyContinue
    if ($npm) { return $npm.Source }
    throw "npm not found in PATH"
}

function Stop-PortListener([int]$Port) {
    $connections = netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING"
    foreach ($line in $connections) {
        $parts = ($line -replace '\s+', ' ').Trim().Split(' ')
        $procId = [int]$parts[-1]
        if ($procId -gt 0) {
            Write-Host "Stopping process on port ${Port} (PID $procId)..."
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }
}

Write-Host ""
Write-Host "Sentinel Demo — Windows one-click startup" -ForegroundColor Green
Write-Host "Repo: $RepoRoot"

# --- Prerequisites ---
Write-Step "Checking prerequisites"
if (-not (Test-Command "forge")) {
    throw "Foundry 'forge' not found in PATH. Install: https://book.getfoundry.sh/getting-started/installation"
}
if (-not (Test-Command "anvil")) {
    throw "Foundry 'anvil' not found in PATH."
}
if (-not (Test-Command "npm")) {
    throw "Node.js npm not found in PATH."
}
Write-Host "forge, anvil, npm OK"

# --- Anvil ---
Write-Step "Starting Anvil on $RpcUrl"
Stop-PortListener -Port $AnvilPort
New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "tmp") | Out-Null
$anvilArgs = @(
    "--chain-id", "31337",
    "--port", "$AnvilPort",
    "--block-gas-limit", "120000000"
)
$anvilLogOut = Join-Path $RepoRoot "tmp\anvil.out.log"
$anvilLogErr = Join-Path $RepoRoot "tmp\anvil.err.log"
Start-Process -FilePath "anvil" -ArgumentList $anvilArgs -RedirectStandardOutput $anvilLogOut -RedirectStandardError $anvilLogErr -WindowStyle Hidden
if (-not (Wait-Rpc -Url $RpcUrl)) {
    throw "Anvil did not become ready. See tmp/anvil.err.log"
}
Write-Host "Anvil ready (logs: tmp/anvil.out.log, tmp/anvil.err.log)"

# --- Deploy ---
$deploymentFile = Join-Path $RepoRoot "contracts\deployments\anvil-31337-demo.json"
if (-not $SkipDeploy) {
    Write-Step "Deploying demo scenario (36 pools + Vault + Router)"
    Push-Location (Join-Path $RepoRoot "contracts")
    $env:PRIVATE_KEY = $AnvilKey
    $env:AGENT_SIGNER = ""
    & forge script script/DeployAllDemo.s.sol:DeployAllDemo --rpc-url $RpcUrl --broadcast -vvv
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        throw "forge deploy failed (exit $LASTEXITCODE)"
    }
    Pop-Location
    if (-not (Test-Path $deploymentFile)) {
        throw "Deploy finished but manifest missing: $deploymentFile"
    }
} else {
    Write-Step "Skipping deploy (-SkipDeploy)"
    if (-not (Test-Path $deploymentFile)) {
        throw "No deployment manifest at $deploymentFile — remove -SkipDeploy or deploy manually"
    }
}

# --- Sync backend .env ---
Write-Step "Writing backend/.env from deployment manifest"
& (Join-Path $RepoRoot "scripts\sync-backend-env.ps1") -RepoRoot $RepoRoot -DeploymentFile $deploymentFile -AnvilPrivateKey $AnvilKey | Out-Null

# --- npm install ---
if (-not $SkipInstall) {
    Write-Step "Installing backend dependencies"
    Push-Location (Join-Path $RepoRoot "backend")
    npm install --no-fund --no-audit 2>&1 | Out-Host
    Pop-Location
    if (-not $SkipFrontend) {
        Write-Step "Installing frontend dependencies"
        Push-Location (Join-Path $RepoRoot "frontend")
        npm install --no-fund --no-audit 2>&1 | Out-Host
        Pop-Location
    }
}

# --- Start backend ---
Write-Step "Starting backend on http://127.0.0.1:$BackendPort"
Stop-PortListener -Port $BackendPort
$backendLogOut = Join-Path $RepoRoot "tmp\backend.out.log"
$backendLogErr = Join-Path $RepoRoot "tmp\backend.err.log"
$npm = Get-NpmPath
Start-Process -FilePath $npm -ArgumentList @("run", "dev") -WorkingDirectory (Join-Path $RepoRoot "backend") -RedirectStandardOutput $backendLogOut -RedirectStandardError $backendLogErr -WindowStyle Hidden

$healthOk = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $h = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/health" -TimeoutSec 2
        if ($h.status -eq "ok") { $healthOk = $true; break }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $healthOk) {
    throw "Backend failed to start. See tmp/backend.err.log"
}
Write-Host "Backend ready"

# --- Optional frontend ---
if (-not $SkipFrontend) {
    Write-Step "Starting frontend on http://127.0.0.1:$FrontendPort"
    Stop-PortListener -Port $FrontendPort
    $frontendLogOut = Join-Path $RepoRoot "tmp\frontend.out.log"
    $frontendLogErr = Join-Path $RepoRoot "tmp\frontend.err.log"
    Start-Process -FilePath $npm -ArgumentList @("run", "dev") -WorkingDirectory (Join-Path $RepoRoot "frontend") -RedirectStandardOutput $frontendLogOut -RedirectStandardError $frontendLogErr -WindowStyle Hidden
    Write-Host "Frontend starting (logs: tmp/frontend.out.log)"
}

# --- Optional verify ---
if ($VerifySwaps) {
    Write-Step "Running swap verify-all (force mode, 36 routes)"
    Start-Sleep -Seconds 2
    $body = '{"amountIn":1,"safe":false}'
    $result = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/swap/verify-all" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 600
    Write-Host "Swap verify: passed=$($result.passed) failed=$($result.failed)"
}

# --- Summary ---
Write-Step "Ready"
$deployment = Get-Content $deploymentFile -Raw | ConvertFrom-Json
Write-Host @"

  Anvil RPC     : $RpcUrl
  Backend       : http://127.0.0.1:$BackendPort
  Frontend      : http://127.0.0.1:$FrontendPort  $(if ($SkipFrontend) { '(not started)' } else { '' })
  Registry      : $($deployment.registry)
  Vault         : $($deployment.vaultExecution)
  Swap Router   : $($deployment.swapRouter)

  Quick test:
    Invoke-RestMethod http://127.0.0.1:$BackendPort/api/debug/status
    Invoke-RestMethod http://127.0.0.1:$BackendPort/api/demo/pools

  Safe swap example:
    Invoke-RestMethod -Method POST -Uri http://127.0.0.1:$BackendPort/api/swap/safe \`
      -ContentType 'application/json' -Body '{\"routeId\":\"route-usdc-good-safe\",\"amountIn\":1}'

  Logs: tmp/anvil.out.log, tmp/backend.out.log$(if (-not $SkipFrontend) { ', tmp/frontend.out.log' } else { '' })

  Re-run deploy only:  .\scripts\start-demo.ps1
  Skip redeploy:       .\scripts\start-demo.ps1 -SkipDeploy
  Stop Anvil/backend:  close hidden processes or reboot ports via script re-run

"@ -ForegroundColor Green
