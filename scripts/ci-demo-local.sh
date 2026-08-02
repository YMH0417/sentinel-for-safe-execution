#!/usr/bin/env bash
# CI: Anvil @31337 (anvil-local) + deploy + backend verify-all (36 pass / 12 fail).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
RPC_URL="http://127.0.0.1:8545"
MANIFEST="$REPO_ROOT/contracts/deployments/local-31337-demo.json"

echo "==> Starting Anvil (chainId 31337)"
anvil --chain-id 31337 --port 8545 --block-gas-limit 120000000 --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
sleep 3

echo "==> Deploying demo (DeployAllDemo)"
cd "$REPO_ROOT/contracts"
export PRIVATE_KEY="$ANVIL_KEY"
export DEMO_PROFILE="anvil-local"
forge script script/DeployAllDemo.s.sol:DeployAllDemo \
  --rpc-url "$RPC_URL" \
  --broadcast

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing manifest: $MANIFEST"
  exit 1
fi

REGISTRY=$(node -e "console.log(require('$MANIFEST').registry)")
VAULT=$(node -e "console.log(require('$MANIFEST').vaultExecution)")
ROUTER=$(node -e "console.log(require('$MANIFEST').swapRouter)")
DEPLOYER=$(node -e "console.log(require('$MANIFEST').scenarioDeployer)")

cat > "$REPO_ROOT/backend/.env" <<EOF
CHAIN_MODE=demo
DEMO_PROFILE=anvil-local
RPC_URL=$RPC_URL
PORT=8080
DEMO_DEPLOYMENT_PATH=../contracts/deployments/local-31337-demo.json
DEMO_REGISTRY_ADDRESS=$REGISTRY
VAULT_EXECUTION_ADDRESS=$VAULT
DEMO_SWAP_ROUTER_ADDRESS=$ROUTER
DEMO_SCENARIO_DEPLOYER=$DEPLOYER
SWAP_PRIVATE_KEY=$ANVIL_KEY
EXECUTOR_PRIVATE_KEY=$ANVIL_KEY
AGENT_PRIVATE_KEY=$ANVIL_KEY
EOF

echo "==> Building backend"
cd "$REPO_ROOT/backend"
npm ci
npm run build

echo "==> Starting backend"
npm start &
BACKEND_PID=$!
trap 'kill $ANVIL_PID $BACKEND_PID 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8080/api/health >/dev/null; then
    break
  fi
  sleep 1
done

echo "==> verify-all (force, amountIn=1)"
RESULT=$(curl -sf -X POST http://127.0.0.1:8080/api/swap/verify-all \
  -H "Content-Type: application/json" \
  -d '{"amountIn":1,"safe":false}')
echo "$RESULT"

PASSED=$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.passed)" "$RESULT")
FAILED=$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.failed)" "$RESULT")

if [[ "$PASSED" != "36" || "$FAILED" != "12" ]]; then
  echo "Expected passed=36 failed=12, got passed=$PASSED failed=$FAILED"
  exit 1
fi

echo "==> Demo integration OK (36/12)"
