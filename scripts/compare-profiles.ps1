# Compare local vs remote demo deployment manifests.
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$localPath = Join-Path $RepoRoot "contracts\deployments\local-31337-demo.json"
$localLegacyPath = Join-Path $RepoRoot "contracts\deployments\local-101437-demo.json"
$remotePath = Join-Path $RepoRoot "contracts\deployments\monad-10143-demo.json"

Write-Host ""
Write-Host "Demo manifest comparison" -ForegroundColor Cyan
Write-Host "  Local:  $localPath"
Write-Host "  Remote: $remotePath"
Write-Host ""

$localExists = Test-Path $localPath
if (-not $localExists -and (Test-Path $localLegacyPath)) {
    $localPath = $localLegacyPath
    $localExists = $true
}
$remoteExists = Test-Path $remotePath

if (-not $localExists -and -not $remoteExists) {
    Write-Host "No manifests found. Deploy first:" -ForegroundColor Yellow
    Write-Host "  Local:  .\start-demo.ps1 -Profile anvil-local"
    Write-Host "  Remote: .\scripts\deploy-monad-testnet.ps1"
    exit 1
}

if (-not $localExists) {
    Write-Host "Missing local manifest — run .\start-demo.ps1 -Profile anvil-local" -ForegroundColor Yellow
}
if (-not $remoteExists) {
    Write-Host "Missing remote manifest - run .\scripts\deploy-monad-testnet.ps1" -ForegroundColor Yellow
}

function Read-Manifest([string]$Path) {
    return Get-Content $Path -Raw | ConvertFrom-Json
}

$compareKeys = @(
    "chainId", "network", "deploymentTarget", "profile",
    "registry", "vaultExecution", "swapRouter", "scenarioDeployer", "deployer", "agentSigner", "testUser"
)

$tokenKeys = @("USDC", "GOOD", "BAD", "BAIT")

if ($localExists -and $remoteExists) {
    $local = Read-Manifest $localPath
    $remote = Read-Manifest $remotePath

    Write-Host "=== Top-level fields ===" -ForegroundColor Green
    $rows = foreach ($key in $compareKeys) {
        $lv = $local.$key
        $rv = $remote.$key
        [PSCustomObject]@{
            Field = $key
            Local = if ($null -eq $lv) { "-" } else { $lv }
            Remote = if ($null -eq $rv) { "-" } else { $rv }
            Match = ($lv -eq $rv)
        }
    }
    $rows | Format-Table -AutoSize

    Write-Host "=== Tokens ===" -ForegroundColor Green
    $tokenRows = foreach ($sym in $tokenKeys) {
        $lv = $local.tokens.$sym
        $rv = $remote.tokens.$sym
        [PSCustomObject]@{
            Token = $sym
            Local = if ($lv) { $lv } else { "-" }
            Remote = if ($rv) { $rv } else { "-" }
            Match = ($lv -eq $rv)
        }
    }
    $tokenRows | Format-Table -AutoSize

    $schemaOk = ($local.chainId -eq $remote.chainId) -and
        ($local.deploymentMode -eq $remote.deploymentMode) -and
        ($local.poolsPerBatch -eq $remote.poolsPerBatch)

    Write-Host "Schema check:" -ForegroundColor Green
    Write-Host "  chainId match:           $($local.chainId -eq $remote.chainId) ($($local.chainId))"
    Write-Host "  deploymentTarget differ: local=$($local.deploymentTarget) remote=$($remote.deploymentTarget)"
    Write-Host "  deploymentMode match:    $($local.deploymentMode -eq $remote.deploymentMode)"
    Write-Host "  poolsPerBatch match:     $($local.poolsPerBatch -eq $remote.poolsPerBatch)"
    if ($schemaOk -and $local.deploymentTarget -ne $remote.deploymentTarget) {
        Write-Host "  OK — same schema, different deployment targets (expected)." -ForegroundColor Green
    }
} elseif ($localExists) {
    $local = Read-Manifest $localPath
    Write-Host "Local manifest only:" -ForegroundColor Green
    Write-Host "  chainId=$($local.chainId) network=$($local.network) deploymentTarget=$($local.deploymentTarget)"
    Write-Host "  registry=$($local.registry)"
} elseif ($remoteExists) {
    $remote = Read-Manifest $remotePath
    Write-Host "Remote manifest only:" -ForegroundColor Green
    Write-Host "  chainId=$($remote.chainId) network=$($remote.network) deploymentTarget=$($remote.deploymentTarget)"
    Write-Host "  registry=$($remote.registry)"
}

Write-Host ""
