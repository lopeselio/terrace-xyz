#!/usr/bin/env bash
# Replaces the Anthropic API key everywhere Terrace uses it, without it ever being printed:
#   cre/.env         CRE_SECRET_ANTHROPIC_API_KEY  (CRE questions workflow: the AI judge)
#   app/.env.local   ANTHROPIC_API_KEY             (take compiler fallback)
#   agents/.env      ANTHROPIC_API_KEY             (The Gaffer)
#   Vercel (prod)    ANTHROPIC_API_KEY
# Run it in your own terminal from monad/:  ./scripts/set-anthropic-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -s -p "Paste the new Anthropic API key (input hidden): " KEY
echo
[[ "$KEY" == sk-ant-* ]] || { echo "That doesn't look like an Anthropic key (should start with sk-ant-)."; exit 1; }

# Check it works before touching anything (listing models costs nothing)
code=$(curl -s -o /dev/null -w "%{http_code}" https://api.anthropic.com/v1/models -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01")
[[ "$code" == 200 ]] || { echo "Anthropic rejected the key (HTTP $code). Nothing changed."; exit 1; }
echo "Key works."

set_var() { # file name
  local file=$1 name=$2
  [[ -f "$file" ]] || { echo "  skip $file (missing)"; return; }
  KEY="$KEY" python3 - "$file" "$name" <<'PY'
import os, re, sys
path, name, key = sys.argv[1], sys.argv[2], os.environ["KEY"]
text = open(path).read()
line = f"{name}={key}"
text = re.sub(rf"^{name}=.*$", lambda _: line, text, flags=re.M) if re.search(rf"^{name}=", text, re.M) else text.rstrip("\n") + f"\n{line}\n"
open(path, "w").write(text)
PY
  echo "  updated $name in $file"
}
set_var cre/.env CRE_SECRET_ANTHROPIC_API_KEY
set_var app/.env.local ANTHROPIC_API_KEY
set_var agents/.env ANTHROPIC_API_KEY

echo "Updating Vercel (production)…"
(cd app && npx -y vercel@63.1.2 env rm ANTHROPIC_API_KEY production -y >/dev/null 2>&1 || true
 printf "%s" "$KEY" | npx -y vercel@63.1.2 env add ANTHROPIC_API_KEY production --sensitive >/dev/null)
echo "  updated ANTHROPIC_API_KEY on Vercel"
echo "Done. Restart the matchday runner and the pundit so they pick it up; the app needs a redeploy."
