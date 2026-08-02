# Sentinel Demo — Windows one-click: Anvil + deploy + sync .env + backend (+ optional frontend)
param(
    [ValidateSet("anvil-local", "anvil-fork-monad")]
    [string]$Profile = "anvil-local",
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

function Get-DemoChainProfile {
    param([string]$Name)
    $profilesPath = Join-Path $RepoRoot "shared\demo-chain-profiles.json"
    if (-not (Test-Path $profilesPath)) {
        throw "Demo chain profiles not found: $profilesPath"
    }
    $profiles = Get-Content $profilesPath -Raw | ConvertFrom-Json
    $profile = $profiles.$Name
    if (-not $profile) {
        throw "Unknown DEMO profile '$Name'"
    }
    return $profile
}

function Wait-Rpc([string]$Url, [int]$MaxSeconds = 45) {
    $body = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
    for ($i = 0; $i -lt $MaxSeconds; $i++) {
        try {
            $resp = Invoke-RestMethod -Uri $Url -Method POST -Body $body -ContentType "application/json" -TimeoutSec 2
            if ($resp.result) { return $resp.result }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $null
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

$chainProfile = Get-DemoChainProfile -Name $Profile
$deploymentFile = Join-Path $RepoRoot ($chainProfile.manifestPath -replace "/", "\")
$ChainId = [int]$chainProfile.chainId

Write-Host ""
Write-Host "Sentinel Demo — Windows one-click startup" -ForegroundColor Green
Write-Host "Repo: $RepoRoot"
Write-Host "Profile: $Profile (chainId $ChainId)"

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
Write-Step "Starting Anvil on $RpcUrl (profile: $Profile)"
Stop-PortListener -Port $AnvilPort
New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "tmp") | Out-Null
$anvilArgs = @(
    "--chain-id", "$ChainId",
    "--port", "$AnvilPort",
    "--block-gas-limit", "120000000"
)
if ($Profile -eq "anvil-fork-monad") {
    $forkUrl = if ($env:MONAD_RPC_URL) { $env:MONAD_RPC_URL } else { $chainProfile.forkUrl }
    if (-not $forkUrl) {
        throw "anvil-fork-monad profile requires forkUrl in demo-chain-profiles.json or MONAD_RPC_URL"
    }
    $anvilArgs += @("--fork-url", $forkUrl)
    Write-Host "Fork URL: $forkUrl"
}
$anvilLogOut = Join-Path $RepoRoot "tmp\anvil.out.log"
$anvilLogErr = Join-Path $RepoRoot "tmp\anvil.err.log"
Start-Process -FilePath "anvil" -ArgumentList $anvilArgs -RedirectStandardOutput $anvilLogOut -RedirectStandardError $anvilLogErr -WindowStyle Hidden
$chainIdHex = Wait-Rpc -Url $RpcUrl
if (-not $chainIdHex) {
    throw "Anvil did not become ready. See tmp/anvil.err.log"
}
$expectedHex = "0x" + $ChainId.ToString("x")
if ($chainIdHex.ToLower() -ne $expectedHex) {
    throw "Anvil chainId mismatch: got $chainIdHex, expected $expectedHex"
}
Start-Sleep -Seconds 2
Write-Host "Anvil ready — chainId $chainIdHex (logs: tmp/anvil.out.log, tmp/anvil.err.log)"

# --- Deploy ---
if (-not $SkipDeploy) {
    Write-Step "Deploying demo scenario (phased: 48 pools + Vault + Router, <=30M gas/tx)"
    Push-Location (Join-Path $RepoRoot "contracts")
    $env:PRIVATE_KEY = $AnvilKey
    $env:AGENT_SIGNER = ""
    $env:DEMO_PROFILE = $Profile
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
& (Join-Path $RepoRoot "scripts\sync-backend-env.ps1") `
    -RepoRoot $RepoRoot `
    -Profile $Profile `
    -DeploymentFile $deploymentFile `
    -AnvilPrivateKey $AnvilKey | Out-Null

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
    Write-Step "Running swap verify-all (force mode, 48 routes)"
    Start-Sleep -Seconds 2
    $body = '{"amountIn":1,"safe":false}'
    $result = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/swap/verify-all" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 600
    Write-Host "Swap verify: passed=$($result.passed) failed=$($result.failed) (expected: 36 pass + 12 TOXIC slippage fail)"
}

# --- Summary ---
Write-Step "Ready"
$deployment = Get-Content $deploymentFile -Raw | ConvertFrom-Json
Write-Host @"

  Profile       : $Profile
  Chain ID      : $ChainId
  Anvil RPC     : $RpcUrl
  Manifest      : $($chainProfile.manifestPath)
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

  Re-run deploy only:  .\start-demo.ps1 -Profile $Profile
  Skip redeploy:       .\start-demo.ps1 -Profile $Profile -SkipDeploy
  Fork Monad locally:  .\start-demo.ps1 -Profile anvil-fork-monad

"@ -ForegroundColor Green
