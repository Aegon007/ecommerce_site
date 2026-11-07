#!/usr/bin/env bash
# ============================================================
# Zero-Downtime Application Deployment & Update Script
# Usage: ./deploy/deploy.sh
# ============================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "========================================================"
echo " Deploying Apex Goods Platform..."
echo " Time: $(date -u +"%Y-%m-%d %H:%M:%SZ")"
echo " Directory: $APP_DIR"
echo "========================================================"

# 1. Verify .env file exists
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "Creating .env from .env.example..."
        cp .env.example .env
        echo "WARNING: Created default .env file. Customize secrets for production."
    else
        echo "ERROR: Neither .env nor .env.example found."
        exit 1
    fi
fi

# 2. Pull latest code if git repo
if [ -d .git ]; then
    echo "Pulling latest code from origin..."
    git pull origin main || true
fi

# 3. Build & launch updated containers
echo "Building and launching containers via Docker Compose..."
docker compose -f docker-compose.prod.yml pull || true
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

# 4. Wait and verify healthcheck
echo "Verifying application health..."
HEALTH_URL="http://localhost:3000/api/health"
MAX_ATTEMPTS=15
ATTEMPT=1
SUCCESS=0

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    echo "Health check attempt $ATTEMPT of $MAX_ATTEMPTS..."
    STATUS=$(docker compose -f docker-compose.prod.yml exec -T web curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || echo "000")
    if [ "$STATUS" = "200" ]; then
        SUCCESS=1
        break
    fi
    sleep 3
    ATTEMPT=$((ATTEMPT + 1))
done

if [ $SUCCESS -eq 1 ]; then
    echo "Application is HEALTHY (HTTP 200)!"
else
    echo "ERROR: Health check failed after $MAX_ATTEMPTS attempts."
    docker compose -f docker-compose.prod.yml logs --tail 50 web
    exit 1
fi

# 5. Clean up dangling images to save disk space
echo "Pruning unused Docker images..."
docker image prune -f || true

echo "========================================================"
echo " Deployment Successful!"
echo " Public Port: 80 / 443"
echo " Health API:  http://localhost/api/health"
echo "========================================================"
