# Switch backend/.env to a demo chain profile without redeploying contracts.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("anvil-local", "anvil-fork-monad", "monad-testnet")]
    [string]$Profile,
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

function Get-DemoChainProfile {
    param([string]$Name, [string]$Root)
    $profilesPath = Join-Path $Root "shared\demo-chain-profiles.json"
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

function Write-DeployHint([string]$Name) {
    Write-Host ""
    Write-Host "Deployment manifest missing for profile '$Name'." -ForegroundColor Yellow
    switch ($Name) {
        "anvil-local" {
            Write-Host "  Run:  .\start-demo.ps1 -Profile anvil-local"
        }
        "anvil-fork-monad" {
            Write-Host "  Run:  .\start-demo.ps1 -Profile anvil-fork-monad"
        }
        "monad-testnet" {
            Write-Host "  Run:  .\scripts\deploy-monad-testnet.ps1"
        }
    }
    Write-Host ""
}

Write-Host ""
Write-Host "Switch demo profile -> $Profile" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"

$chainProfile = Get-DemoChainProfile -Name $Profile -Root $RepoRoot
$manifestPath = Join-Path $RepoRoot ($chainProfile.manifestPath -replace "/", "\")

Write-Host "Manifest: $($chainProfile.manifestPath)"
Write-Host "RPC:      $($chainProfile.rpcUrl)"
Write-Host "Target:   $($chainProfile.deploymentTarget)"

if (-not (Test-Path $manifestPath)) {
    Write-DeployHint -Name $Profile
    exit 1
}

if ($chainProfile.deploymentTarget -eq "remote") {
    Write-Host ""
    Write-Host "Remote profile - after sync, set SWAP/EXECUTOR/AGENT private keys in backend/.env" -ForegroundColor Yellow
    Write-Host "Then restart backend: stop port 8080 and run 'cd backend; npm run dev'"
}

& (Join-Path $RepoRoot "scripts\sync-backend-env.ps1") `
    -RepoRoot $RepoRoot `
    -Profile $Profile `
    -DeploymentFile $manifestPath | Out-Null

Write-Host ""
Write-Host "Switched backend/.env to profile '$Profile'." -ForegroundColor Green
Write-Host "Restart backend for changes to take effect (tsx watch may reload automatically)."
Write-Host ""
Write-Host "Verify:"
Write-Host "  Invoke-RestMethod http://127.0.0.1:8080/api/debug/status | Select demoProfile, deploymentTarget, expectedChainId, chainName"
