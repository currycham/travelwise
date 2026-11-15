#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root'; exit 1; }
BASE=/srv/travelwise
HERE="$(cd "$(dirname "$0")" && pwd)"
id travelwise >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin travelwise
mkdir -p "$BASE/app" "$BASE/data" "$BASE/backup"
chown -R travelwise:travelwise "$BASE"
chmod 750 "$BASE" "$BASE/data" "$BASE/backup"
install -m 644 "$HERE/travelwise.service" /etc/systemd/system/travelwise.service
install -m 755 "$HERE/travelwise-backup" /etc/cron.daily/travelwise-backup
mkdir -p /usr/local/libexec
install -o root -g root -m 755 "$HERE/travelwise-accounts" /usr/local/libexec/travelwise-accounts
install -m 644 "$HERE/travelwise-accounts.socket" /etc/systemd/system/travelwise-accounts.socket
install -m 644 "$HERE/travelwise-accounts@.service" /etc/systemd/system/travelwise-accounts@.service
install -o root -g root -m 755 "$HERE/travelwise-identity-refresh" /usr/local/libexec/travelwise-identity-refresh
install -m 644 "$HERE/travelwise-identity-refresh.service" /etc/systemd/system/travelwise-identity-refresh.service
install -m 644 "$HERE/travelwise-identity-refresh.timer" /etc/systemd/system/travelwise-identity-refresh.timer
systemctl daemon-reload
systemctl start travelwise-identity-refresh.service
systemctl enable --now travelwise-identity-refresh.timer >/dev/null
systemctl enable --now travelwise-accounts.socket >/dev/null
systemctl enable travelwise >/dev/null
# Install only the product fragment; preserve all existing imports and services.
cp /etc/caddy/Caddyfile "$BASE/backup/Caddyfile.before-travelwise.$(date +%Y%m%d%H%M%S)"
install -m 644 "$HERE/travelwise.caddy" /etc/caddy/travelwise.caddy
if ! grep -q '^import travelwise.caddy$' /etc/caddy/Caddyfile; then
  printf '\nimport travelwise.caddy\n' >> /etc/caddy/Caddyfile
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    sed -i '/^import travelwise.caddy$/d' /etc/caddy/Caddyfile
    echo 'Caddy validation failed; new import removed'; exit 1
  fi
else
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
fi
systemctl reload caddy
echo 'TravelWise service and proxy installed'
