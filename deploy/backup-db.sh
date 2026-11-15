#!/usr/bin/env bash
# ============================================================
# Automated Database Backup & Cloud Sync Script
# Creates a consistent SQLite snapshot before compression.
# Supports AWS S3 and OCI Object Storage
# ============================================================

set -euo pipefail
umask 077
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

BACKUP_DIR="${BACKUP_DIR:-${HOME}/backups}"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="${BACKUP_DIR}/ecommerce_db_${TIMESTAMP}.sqlite.gz"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

echo "========================================================"
echo " Starting Database Backup: $(date)"
echo "========================================================"

# 1. Snapshot the database using SQLite, including writes in the WAL.
TEMP_DIR="$(mktemp -d "${BACKUP_DIR}/.snapshot.XXXXXX")"
CONTAINER_NAME="${BACKUP_CONTAINER:-}"
CONTAINER_SNAPSHOT=""
cleanup() {
    if [ -n "$CONTAINER_SNAPSHOT" ]; then
        docker exec "$CONTAINER_NAME" rm -f "$CONTAINER_SNAPSHOT" >/dev/null 2>&1 || true
    fi
    rm -f -- "$TEMP_DIR/backup.db" "$TEMP_DIR/backup.gz"
    rmdir -- "$TEMP_DIR"
}
trap cleanup EXIT
if [ -z "$CONTAINER_NAME" ] && command -v docker >/dev/null; then
    for candidate in ecommerce_app ecommerce_web; do
        if [ "$(docker inspect -f '{{.State.Running}}' "$candidate" 2>/dev/null || true)" = true ]; then
            CONTAINER_NAME="$candidate"
            break
        fi
    done
fi
if [ -n "$CONTAINER_NAME" ]; then
    CONTAINER_SNAPSHOT="/tmp/apex-$(basename "$TEMP_DIR").db"
    docker exec "$CONTAINER_NAME" node src/backup-db.js "$CONTAINER_SNAPSHOT"
    docker cp "$CONTAINER_NAME:$CONTAINER_SNAPSHOT" "$TEMP_DIR/backup.db"
else
    node src/backup-db.js "$TEMP_DIR/backup.db"
fi
gzip -c "$TEMP_DIR/backup.db" > "$TEMP_DIR/backup.gz"
mv -- "$TEMP_DIR/backup.gz" "$BACKUP_FILE"
echo "Backup saved to: $BACKUP_FILE"

# 2. Upload to Cloud Object Storage (if configured)

# AWS S3 Sync
if [ -n "${S3_BUCKET_NAME:-}" ] && command -v aws &> /dev/null; then
    echo "Uploading backup to AWS S3: s3://${S3_BUCKET_NAME}/backups/"
    aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET_NAME}/backups/$(basename "$BACKUP_FILE")"
    echo "S3 Upload Complete."
fi

# OCI Object Storage Sync
if [ -n "${OCI_BUCKET_NAME:-}" ] && [ -n "${OCI_NAMESPACE:-}" ] && command -v oci &> /dev/null; then
    echo "Uploading backup to OCI Object Storage bucket: ${OCI_BUCKET_NAME}"
    oci os object put -ns "$OCI_NAMESPACE" -bn "$OCI_BUCKET_NAME" --file "$BACKUP_FILE" --name "backups/$(basename "$BACKUP_FILE")"
    echo "OCI Object Storage Upload Complete."
fi

# 3. Rotate old local backups (retain last 14 days)
echo "Cleaning up local backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "ecommerce_db_*.sqlite.gz" -type f -mtime +"$RETENTION_DAYS" -exec rm -f {} \;

echo "Backup and rotation finished successfully."
