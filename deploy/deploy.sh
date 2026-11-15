#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DEPLOY_TARGET="${DEPLOY_HOST:-ubuntu@waywise.tech}"
DEPLOY_IDENTITY="${DEPLOY_KEY:-$HOME/.ssh/waywise_ed25519}"
# Match the existing trusted server key without adding a new hostname blindly.
DEPLOY_ALIAS="${DEPLOY_HOST_KEY_ALIAS:-$(python3 -c 'import socket; print(socket.gethostbyname("waywise.tech"))')}"
SSH=(ssh -i "$DEPLOY_IDENTITY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "HostKeyAlias=$DEPLOY_ALIAS" "$DEPLOY_TARGET")
export RSYNC_RSH="ssh -i $DEPLOY_IDENTITY -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o HostKeyAlias=$DEPLOY_ALIAS"
npm run check
npm test
"${SSH[@]}" 'sudo mkdir -p /srv/travelwise/app /srv/travelwise/backup; if sudo test -f /srv/travelwise/app/app/server.mjs; then sudo tar -czf /srv/travelwise/backup/app-before-deploy.tgz --exclude=.env --exclude=data -C /srv/travelwise/app .; fi'
rsync -az --rsync-path='sudo rsync' --include='.env.example' --exclude='.env*' --exclude='.git/' --exclude='data/' --exclude='node_modules/' --exclude='docs/screenshots/' --exclude='.DS_Store' ./ "$DEPLOY_TARGET:/srv/travelwise/app/"
if [[ "${1:-}" == --setup ]]; then "${SSH[@]}" 'sudo bash /srv/travelwise/app/deploy/setup-server.sh'; fi
"${SSH[@]}" 'sudo test -f /srv/travelwise/app/.env; sudo chown -R travelwise:travelwise /srv/travelwise/app /srv/travelwise/data; sudo chmod 600 /srv/travelwise/app/.env; sudo systemctl restart travelwise; for n in $(seq 1 20); do curl -fsS http://127.0.0.1:8600/api/health && exit 0; sleep 1; done; exit 1'
echo 'TravelWise deployed'
