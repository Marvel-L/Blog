#!/bin/sh
# Run as root by systemd. The fixed paths match the deployment runbook.
set -eu
/opt/dblog-tools/certbot/bin/certbot renew --cert-name 43.138.216.53 --no-random-sleep-on-renew --quiet
# Reload only when the renewed leaf certificate differs from the last loaded one.
certificate=/etc/letsencrypt/live/43.138.216.53/fullchain.pem
state=/var/lib/dblog-acme/loaded-certificate.sha256
current=$(sha256sum "$certificate" | cut -d ' ' -f 1)
previous=$(cat "$state" 2>/dev/null || true)
if [ "$current" != "$previous" ]; then
    cd /opt/dblog/current
    docker compose --env-file /opt/dblog/shared/cloud.env -f deploy/cloud/compose.yml -f deploy/cloud/compose.ip.yml exec -T gateway caddy reload --config /etc/caddy/Caddyfile
    printf '%s\n' "$current" > "$state"
fi
