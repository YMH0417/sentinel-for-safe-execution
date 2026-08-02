# Shortcut — run from repo root:  .\switch-demo.ps1 -Profile anvil-local
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("anvil-local", "anvil-fork-monad", "monad-testnet")]
    [string]$Profile
)

& (Join-Path $PSScriptRoot "scripts\switch-demo-profile.ps1") -Profile $Profile @args
