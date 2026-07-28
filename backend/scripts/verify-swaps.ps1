# Verify all 36 demo swap routes via backend API.
# Prerequisites: Anvil + demo deploy + backend (CHAIN_MODE=demo, RPC_URL=http://127.0.0.1:8545)
param(
  [string]$BaseUrl = "http://127.0.0.1:8080",
  [double]$AmountIn = 1,
  [switch]$WithEvaluate
)

$body = @{
  amountIn = $AmountIn
  skipEvaluate = -not $WithEvaluate
} | ConvertTo-Json

Write-Host "POST $BaseUrl/api/swap/verify-all amountIn=$AmountIn skipEvaluate=$(-not $WithEvaluate)"
$result = Invoke-RestMethod -Uri "$BaseUrl/api/swap/verify-all" -Method POST -Body $body -ContentType "application/json"
Write-Host "passed=$($result.passed) failed=$($result.failed) total=$($result.total)"
if ($result.failed -gt 0) {
  $result.errors | ConvertTo-Json -Depth 3
  exit 1
}
exit 0
