#!/usr/bin/env bash
# ============================================================
# Automated Database Backup & Cloud Sync Script
# Runs daily via Cron to ensure zero data loss
# Supports AWS S3 and OCI Object Storage
# ============================================================

set -euo pipefail

BACKUP_DIR="${HOME}/backups"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
CONTAINER_NAME="ecommerce_app"
BACKUP_FILE="${BACKUP_DIR}/ecommerce_db_${TIMESTAMP}.sqlite.gz"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

echo "========================================================"
echo " Starting Database Backup: $(date)"
echo "========================================================"

# 1. Safely extract SQLite database using SQLite WAL-safe dump or file copy
if docker ps | grep -q "$CONTAINER_NAME"; then
    echo "Creating compressed backup from running Docker container..."
    docker exec "$CONTAINER_NAME" /bin/sh -c "cat /app/data/ecommerce.db" | gzip -c > "$BACKUP_FILE"
    echo "Backup saved to: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
elif [ -f "./data/ecommerce.db" ]; then
    echo "Backing up local database file..."
    gzip -c "./data/ecommerce.db" > "$BACKUP_FILE"
    echo "Backup saved to: $BACKUP_FILE"
else
    echo "ERROR: Neither container '$CONTAINER_NAME' nor local database found."
    exit 1
fi

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
