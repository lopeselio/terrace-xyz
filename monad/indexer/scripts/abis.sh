#!/usr/bin/env bash
# Copies contract ABIs from the Foundry build into abis/, so the indexer always matches the contracts.
# Run from monad/indexer after `forge build` in monad/contracts.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
out="$here/../contracts/out"
for c in TerraceUSD TerraceOracle TerraceMarkets TerraceParlays TerraceMatchups TerraceLeagues TerraceGovernance TerraceChat TerraceReputation TerraceFollows; do
  python3 -c "import json,sys; json.dump(json.load(open(sys.argv[1]))['abi'], open(sys.argv[2],'w'), indent=1)" \
    "$out/$c.sol/$c.json" "$here/abis/$c.json"
done
echo "copied $(ls "$here/abis" | wc -l | tr -d ' ') ABIs"
