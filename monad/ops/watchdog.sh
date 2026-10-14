#!/usr/bin/env bash
# Terrace runner watchdog: every 5 minutes (systemd timer), checks match-day, the pundit and the House
# and pushes a phone alert through ntfy when something is wrong. One alert when a problem starts, a
# reminder every 6 hours while it lasts, and an all-clear when it's gone.
#
# Config in ~/terrace/.watchdog.env:  NTFY_TOPIC=<private topic name>
set -uo pipefail
HOME_DIR=/home/terrace/terrace
STATE=$HOME_DIR/.watchdog-state
REMIND_EVERY=$((6 * 3600))
source "$HOME_DIR/.watchdog.env"
export PATH=/home/terrace/.bun/bin:/home/terrace/.cre/bin:$PATH

problems=()
add() { problems+=("$1|$2"); } # key|message

# Log lines can carry long hex (addresses, hashes): shorten them before they leave the server.
tidy() { sed -E 's/(0x[0-9a-fA-F]{6})[0-9a-fA-F]{10,}/\1…/g' | cut -c1-160; }
count() { journalctl -u "terrace-$1" -o cat --since "$2" 2>/dev/null | grep -cE "$3"; }
last() { journalctl -u "terrace-$1" -o cat --since "$2" 2>/dev/null | grep -E "$3" | tail -1 | tidy; }

for s in matchday pundit house; do
  if ! systemctl is-active -q "terrace-$s"; then
    add "down-$s" "$s is not running ($(systemctl is-active "terrace-$s"))."
  fi
  restarts=$(systemctl show "terrace-$s" -p NRestarts --value)
  if [ "${restarts:-0}" -ge 3 ] && [ "$(count "$s" -30min '^Started|Terrace match-day runner|is on the terrace|Terrace House:')" -ge 3 ]; then
    add "crashloop-$s" "$s keeps crashing and restarting ($restarts restarts)."
  fi
done

n=$(count matchday -15min 'failed \(exit|check failed')
[ "$n" -ge 2 ] && add matchday-failing "Match-day failed $n times in 15 min. Last: $(last matchday -15min 'failed \(exit|check failed')"
n=$(count pundit -30min 'round failed')
[ "$n" -ge 2 ] && add pundit-failing "Pundit rounds failing ($n in 30 min). Last: $(last pundit -30min 'round failed')"
n=$(count house -15min 'round failed')
[ "$n" -ge 3 ] && add house-failing "House rounds failing ($n in 15 min). Last: $(last house -15min 'round failed')"

# Chainlink login: settlement silently stops without it. Hourly, and remembered between runs.
if [ "$(date +%M)" -lt 5 ] || [ ! -f "$STATE.cre" ]; then
  if (cd "$HOME_DIR/cre" && timeout 60 cre whoami 2>&1) | grep -q "Email:"; then echo ok > "$STATE.cre"; else echo out > "$STATE.cre"; fi
fi
[ "$(cat "$STATE.cre" 2>/dev/null)" = out ] && add cre-login "The server's Chainlink login has expired: nothing settles until it signs in again."

# Gas: the broadcaster sends every settlement to the chain; the treasury tops up new fans and the agents.
mon() { # address -> whole MON, or empty if the RPC didn't answer
  curl -s -m 15 https://testnet-rpc.monad.xyz -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$1\",\"latest\"]}" |
    python3 -c 'import sys,json; print(int(json.load(sys.stdin)["result"],16)//10**18)' 2>/dev/null
}
low() { # key name address min_mon what_stops
  local bal; bal=$(mon "$3")
  [ -n "$bal" ] && [ "$bal" -lt "$4" ] && add "$1" "$2 is down to $bal MON (alert below $4). Top up $3 or $5."
}
low gas-broadcaster "The CRE broadcaster" 0x901E8F75cc9F453fD9530b0C5b6763A1343949d7 2 "settlement stops"
low gas-treasury "The onboarding treasury" 0x7C45b7d13aCBCc0F62fb061EE05Bb2E1a4991718 15 "new fans and the agents stop getting gas"

disk=$(df --output=pcent / | tail -1 | tr -dc 0-9)
[ "$disk" -ge 85 ] && add disk "Server disk is ${disk}% full."

notify() { # title priority tags message
  curl -s -m 20 -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null
}

now=$(date +%s)
touch "$STATE"
declare -A seen
while IFS='|' read -r key at; do [ -n "$key" ] && seen[$key]=$at; done < "$STATE"
next=""
for p in "${problems[@]}"; do
  key=${p%%|*}; msg=${p#*|}
  at=${seen[$key]:-0}
  if [ $((now - at)) -ge $REMIND_EVERY ]; then
    [ "$at" = 0 ] && title="Terrace: problem on the server" || title="Terrace: still a problem"
    notify "$title" high warning "$msg"
    at=$now
  fi
  next+="$key|$at"$'\n'
  unset "seen[$key]"
done
for key in "${!seen[@]}"; do notify "Terrace: all clear" default white_check_mark "Fixed: $key"; done
printf "%s" "$next" > "$STATE"
