#!/usr/bin/env bash
# Nightly Postgres backup for JACMS (single office instance).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${JACMS_ENV_FILE:-${ROOT}/.env}"
BACKUP_DIR="${JACMS_BACKUP_DIR:-/var/backups/jacms}"
RETAIN_DAYS="${JACMS_BACKUP_RETAIN_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source <(grep -E '^(DATABASE_URL|DISPLAY_TIME_ZONE)=' "$ENV_FILE" | sed 's/\r$//')
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

install -d -m 0700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/jacms-${STAMP}.sql.gz"

pg_dump "$DATABASE_URL" | gzip -9 >"$OUT"
chmod 0600 "$OUT"
find "$BACKUP_DIR" -type f -name 'jacms-*.sql.gz' -mtime +"$RETAIN_DAYS" -delete
echo "Backup written: $OUT"
