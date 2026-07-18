#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/teknoblog-radar"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
runuser -u postgres -- pg_dump -Fc teknoblog_radar > "$BACKUP_DIR/teknoblog_radar_${STAMP}.dump"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'teknoblog_radar_*.dump' -mtime +14 -delete
echo "PostgreSQL backup completed: teknoblog_radar_${STAMP}.dump"
