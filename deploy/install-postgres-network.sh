#!/bin/bash
# Allow PostgreSQL access from localhost, office LAN, and Tailscale (scram password).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS_FILE="$ROOT/deploy/.db-network-password"
PG_CONF=/etc/postgresql/18/main/postgresql.conf
PG_HBA=/etc/postgresql/18/main/pg_hba.conf
MARKER="# NEXCRM network access"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [[ ! -f "$PASS_FILE" ]]; then
  openssl rand -base64 24 | tr -d '/+=' | head -c 28 >"$PASS_FILE"
  chown server:server "$PASS_FILE"
  chmod 600 "$PASS_FILE"
fi
DB_PASS="$(tr -d '\n' <"$PASS_FILE")"
DB_PASS_SQL="${DB_PASS//\'/\'\'}"

# Password for TCP clients (peer/socket auth unchanged for local nexcrm)
runuser -u postgres -- psql -d postgres -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE nexcrm WITH LOGIN PASSWORD '${DB_PASS_SQL}';
SQL

# Listen on all interfaces; access controlled by pg_hba + firewall
if grep -q "^listen_addresses" "$PG_CONF"; then
  sed -i "s/^listen_addresses.*/listen_addresses = '*'/" "$PG_CONF"
else
  sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
fi

if ! grep -q "$MARKER" "$PG_HBA"; then
  cat >>"$PG_HBA" <<EOF

$MARKER
# Local TCP
host    nexcrm_dev    nexcrm    127.0.0.1/32         scram-sha-256
host    nexcrm_dev    nexcrm    ::1/128              scram-sha-256
# Office LAN
host    nexcrm_dev    nexcrm    192.168.100.0/24     scram-sha-256
# Tailscale CGNAT
host    nexcrm_dev    nexcrm    100.64.0.0/10        scram-sha-256
EOF
fi

systemctl restart postgresql

if command -v ufw >/dev/null; then
  ufw allow from 192.168.100.0/24 to any port 5432 proto tcp || true
  ufw allow from 100.64.0.0/10 to any port 5432 proto tcp || true
fi

install -m 0644 "$ROOT/deploy/database-network.env.example" /tmp/nexcrm-db-url.example
cat >"$ROOT/deploy/database-network.env" <<EOF
# Generated $(date -Is) — keep private (chmod 600)
# Local socket (app on this machine — preferred):
# DATABASE_URL=postgresql:///nexcrm_dev?host=/var/run/postgresql&user=nexcrm

# TCP on this host:
DATABASE_URL_LOCAL=postgresql://nexcrm:${DB_PASS}@127.0.0.1:5432/nexcrm_dev

# Office LAN:
DATABASE_URL_LAN=postgresql://nexcrm:${DB_PASS}@192.168.100.10:5432/nexcrm_dev

# Tailscale:
DATABASE_URL_TAILSCALE=postgresql://nexcrm:${DB_PASS}@100.77.125.102:5432/nexcrm_dev
# or hostname:
# DATABASE_URL_TAILSCALE=postgresql://nexcrm:${DB_PASS}@server-1.snowy-pride.ts.net:5432/nexcrm_dev
EOF
chown server:server "$ROOT/deploy/database-network.env" "$PASS_FILE"
chmod 600 "$ROOT/deploy/database-network.env" "$PASS_FILE"

echo "PostgreSQL network access enabled."
echo "Connection strings: $ROOT/deploy/database-network.env"
ss -ltn | grep 5432 || true
