#!/usr/bin/env bash
# Host the group-chat bot on the Terrace runners VM, behind Caddy (automatic HTTPS) at $BOT_PUBLIC_URL.
# Run from monad/bot on the Mac:  bash scripts/deploy-azure.sh        (first time: --setup)
#   --setup   also opens ports 80/443 on the VM's firewall, installs Caddy and the systemd unit.
# Needs: az logged in, ~/.ssh/terrace_azure, a filled-in .env here, and DNS for the bot's host pointing at the VM.
# Re-running without --setup just ships the code, keeps the database, and restarts the bot.
set -euo pipefail
cd "$(dirname "$0")/.."

VM=terrace@4.223.115.27
KEY=~/.ssh/terrace_azure
RG=terrace-runners
NSG=terrace-runnersNSG
SSH=(ssh -i "$KEY" -o ConnectTimeout=15 "$VM")

[ -f .env ] || { echo "No .env here (cp .env.example .env and fill it in)"; exit 1; }
HOST=$(grep -E '^BOT_PUBLIC_URL=' .env | cut -d= -f2- | sed -E 's#^https?://##; s#/.*$##')
[ -n "$HOST" ] || { echo "Set BOT_PUBLIC_URL in .env"; exit 1; }
grep -qE '^TELEGRAM_BOT_TOKEN=.+' .env || { echo "Set TELEGRAM_BOT_TOKEN in .env"; exit 1; }

if [ "${1:-}" = "--setup" ]; then
  echo "== firewall: allow 80 (certificate check) and 443 (Telegram webhook, /go links)"
  az network nsg rule create -g "$RG" --nsg-name "$NSG" -n bot-http  --priority 310 --access Allow --protocol Tcp --direction Inbound --destination-port-ranges 80  -o none
  az network nsg rule create -g "$RG" --nsg-name "$NSG" -n bot-https --priority 320 --access Allow --protocol Tcp --direction Inbound --destination-port-ranges 443 -o none
fi

echo "== code -> ~/terrace/bot (database and .env on the server are kept)"
rsync -az --delete -e "ssh -i $KEY" --exclude node_modules --exclude .env --exclude 'bot.sqlite*' ./ "$VM:terrace/bot/"
# The .env goes across as a file, never through the terminal.
"${SSH[@]}" 'umask 077; cat > ~/terrace/bot/.env && chmod 600 ~/terrace/bot/.env' < .env
"${SSH[@]}" 'cd ~/terrace/bot && ~/.bun/bin/bun install --production --frozen-lockfile 2>/dev/null || ~/.bun/bin/bun install --production'

if [ "${1:-}" = "--setup" ]; then
  echo "== Caddy for $HOST and the terrace-bot service"
  "${SSH[@]}" "sudo apt-get install -y -qq caddy >/dev/null
printf '%s {\n\treverse_proxy 127.0.0.1:8787\n}\n' '$HOST' | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl reload-or-restart caddy
sudo tee /etc/systemd/system/terrace-bot.service >/dev/null <<'UNIT'
[Unit]
Description=Terrace group-chat bot
After=network-online.target
Wants=network-online.target

[Service]
User=terrace
WorkingDirectory=/home/terrace/terrace/bot
Environment=PATH=/home/terrace/.bun/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=/home/terrace/terrace/bot/.env
ExecStart=/home/terrace/.bun/bin/bun src/main.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable -q terrace-bot"
fi

"${SSH[@]}" 'sudo systemctl restart terrace-bot; sleep 4; systemctl is-active terrace-bot; journalctl -u terrace-bot -n 5 --no-pager'
echo "== https://$HOST/health"
curl -fsS --max-time 20 "https://$HOST/health" && echo || echo "(not reachable yet: DNS or the certificate may still be on its way; Caddy keeps retrying)"
echo "Then, once /health says ok: bun run webhook"
