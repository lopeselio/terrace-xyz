#!/usr/bin/env bash
# Builds Terrace locally and ships it to Vercel as a prebuilt deployment.
#
# Why local: the app imports shared code from ../cre/shared and ../deployments.
# Why the patch step: the Vercel team stores every variable as sensitive, so `vercel pull`
# writes "[SENSITIVE]" placeholders. Public NEXT_PUBLIC_* values are baked into the browser
# bundle at build time, so they're filled from .env.local here. Server secrets stay on Vercel
# and are injected at runtime.
set -euo pipefail
cd "$(dirname "$0")/.."

vercel pull --yes --environment=production >/dev/null
python3 - <<'PY'
import re
local = dict(re.findall(r'^([A-Z_]+)=(.*)$', open('.env.local').read(), re.M))
path = '.vercel/.env.production.local'
pulled = open(path).read()
public = {k: v for k, v in local.items() if k.startswith('NEXT_PUBLIC_')}
public['NEXT_PUBLIC_SITE_URL'] = 'https://play.terrace.social'
for k, v in public.items():
    line = f'{k}="{v}"'
    pulled = re.sub(rf'^{k}=.*$', line, pulled, flags=re.M) if re.search(rf'^{k}=', pulled, re.M) else pulled + f'\n{line}\n'
open(path, 'w').write(pulled)
print('filled', ', '.join(sorted(public)))
PY
vercel build --prod
# Uploads to Vercel sometimes stall ("fetch failed"); a retry picks up where it left off.
for attempt in 1 2 3 4 5; do
  if npx -y vercel@63.1.2 deploy --prebuilt --prod; then exit 0; fi
  echo "upload attempt $attempt failed, retrying" >&2
  sleep 4
done
exit 1
