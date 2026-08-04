# Verify Sentinel demo contracts on public Monad testnet (chain 10143).
# Reads addresses from contracts/deployments/monad-10143-demo.json
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$RpcUrl = "https://testnet-rpc.monad.xyz"
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

if (-not (Get-Command cast -ErrorAction SilentlyContinue)) {
    throw "Foundry 'cast' not found. Install: https://book.getfoundry.sh/getting-started/installation"
}

$manifestPath = Join-Path $RepoRoot "contracts\deployments\monad-10143-demo.json"
if (-not (Test-Path $manifestPath)) {
    throw "Manifest not found: $manifestPath"
}

$m = Get-Content $manifestPath -Raw | ConvertFrom-Json

$oldVault = "0xce9F5bdCAfC36E5468F738845203Ce3064eB50f9"
$oldRouter = "0x69ED45779c05DE88CEE06d668Aa6b356C3f9Aad9"

function Invoke-Cast([string[]]$CastArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & cast @CastArgs 2>&1 | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }
        if ($LASTEXITCODE -ne 0) {
            throw "cast failed: cast $($CastArgs -join ' ') -> $($out -join '; ')"
        }
        return ($out | Out-String).Trim()
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Get-CodeSize([string]$Address) {
    $code = Invoke-Cast @("code", $Address, "--rpc-url", $RpcUrl)
    if (-not $code -or $code -eq "0x") { return 0 }
    return ($code.Length - 2) / 2
}

function Assert-Eq([string]$Label, $Expected, $Actual) {
    $ok = "$Expected" -eq "$Actual"
    $mark = if ($ok) { "OK" } else { "FAIL" }
    Write-Host ("  [{0}] {1}: expected={2} actual={3}" -f $mark, $Label, $Expected, $Actual)
    if (-not $ok) { script:failCount++ }
}

$failCount = 0

Write-Host ""
Write-Host "Sentinel — Monad testnet verification" -ForegroundColor Cyan
Write-Host "RPC: $RpcUrl"
Write-Host "Manifest: $manifestPath"
Write-Host ""

Write-Host "Chain" -ForegroundColor Yellow
Assert-Eq "chainId" 10143 (Invoke-Cast @("chain-id", "--rpc-url", $RpcUrl))

Write-Host "Registry ($($m.registry))" -ForegroundColor Yellow
Assert-Eq "poolCount" 48 (Invoke-Cast @("call", $m.registry, "poolCount()(uint256)", "--rpc-url", $RpcUrl))
Assert-Eq "isSealed" "true" (Invoke-Cast @("call", $m.registry, "isSealed()(bool)", "--rpc-url", $RpcUrl))
Assert-Eq "tokenCount" 4 (Invoke-Cast @("call", $m.registry, "tokenCount()(uint256)", "--rpc-url", $RpcUrl))
Assert-Eq "deployer" $m.scenarioDeployer (Invoke-Cast @("call", $m.registry, "deployer()(address)", "--rpc-url", $RpcUrl))

Write-Host "ScenarioDeployer ($($m.scenarioDeployer))" -ForegroundColor Yellow
Assert-Eq "poolsDeployed" 48 (Invoke-Cast @("call", $m.scenarioDeployer, "poolsDeployed()(uint256)", "--rpc-url", $RpcUrl))
Assert-Eq "scenarioSealed" "true" (Invoke-Cast @("call", $m.scenarioDeployer, "scenarioSealed()(bool)", "--rpc-url", $RpcUrl))
Assert-Eq "registry" $m.registry (Invoke-Cast @("call", $m.scenarioDeployer, "registry()(address)", "--rpc-url", $RpcUrl))

Write-Host "Router ($($m.swapRouter))" -ForegroundColor Yellow
Assert-Eq "vault" $m.vaultExecution (Invoke-Cast @("call", $m.swapRouter, "vault()(address)", "--rpc-url", $RpcUrl))
Assert-Eq "registry" $m.registry (Invoke-Cast @("call", $m.swapRouter, "registry()(address)", "--rpc-url", $RpcUrl))
Assert-Eq "scenarioDeployer" $m.scenarioDeployer (Invoke-Cast @("call", $m.swapRouter, "scenarioDeployer()(address)", "--rpc-url", $RpcUrl))
Assert-Eq "achievements" $m.achievements (Invoke-Cast @("call", $m.swapRouter, "achievements()(address)", "--rpc-url", $RpcUrl))

Write-Host "Vault ($($m.vaultExecution))" -ForegroundColor Yellow
Assert-Eq "achievements" $m.achievements (Invoke-Cast @("call", $m.vaultExecution, "achievements()(address)", "--rpc-url", $RpcUrl))
Assert-Eq "agentSigner" $m.agentSigner (Invoke-Cast @("call", $m.vaultExecution, "agentSigner()(address)", "--rpc-url", $RpcUrl))

Write-Host "Achievements ($($m.achievements))" -ForegroundColor Yellow
Assert-Eq "usdcToken" $m.tokens.USDC (Invoke-Cast @("call", $m.achievements, "usdcToken()(address)", "--rpc-url", $RpcUrl))
Assert-Eq "reporter[vault]" "true" (Invoke-Cast @("call", $m.achievements, "reporters(address)(bool)", $m.vaultExecution, "--rpc-url", $RpcUrl))
Assert-Eq "reporter[router]" "true" (Invoke-Cast @("call", $m.achievements, "reporters(address)(bool)", $m.swapRouter, "--rpc-url", $RpcUrl))

Write-Host "ScenarioDeployer auth" -ForegroundColor Yellow
Assert-Eq "authorizedFunders[router]" "true" (Invoke-Cast @("call", $m.scenarioDeployer, "authorizedFunders(address)(bool)", $m.swapRouter, "--rpc-url", $RpcUrl))

Write-Host "Sample route route-usdc-good-safe" -ForegroundColor Yellow
$routeId = Invoke-Cast @("keccak", "route-usdc-good-safe")
$poolLine = Invoke-Cast @("call", $m.registry, "getPoolByRouteId(bytes32)(bytes32,address,address,address,uint8)", $routeId, "--rpc-url", $RpcUrl)
Write-Host "  pool entry: $poolLine"
if ($poolLine -notmatch "0x[0-9a-fA-F]{40}") {
    Write-Host "  [FAIL] could not resolve sample pool" -ForegroundColor Red
    $failCount++
}

Write-Host "Bytecode sizes" -ForegroundColor Yellow
@(
    @("registry", $m.registry),
    @("scenarioDeployer", $m.scenarioDeployer),
    @("vaultExecution", $m.vaultExecution),
    @("swapRouter", $m.swapRouter),
    @("achievements", $m.achievements),
    @("USDC", $m.tokens.USDC),
    @("oldVault (orphan)", $oldVault),
    @("oldRouter (orphan)", $oldRouter)
) | ForEach-Object {
    $size = Get-CodeSize $_[1]
    Write-Host ("  {0}: {1} bytes" -f $_[0], $size)
    if ($size -eq 0) { $failCount++ }
}

Write-Host ""
if ($failCount -gt 0) {
    Write-Host "Verification FAILED ($failCount checks)" -ForegroundColor Red
    exit 1
}

Write-Host "All checks passed." -ForegroundColor Green
Write-Host "See docs/monad-testnet-contracts.md for full inventory."
