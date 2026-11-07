# Day-2 Operations & Maintenance Runbook

This runbook covers everything required to keep your e-commerce platform running smoothly, securely, and reliably in production on AWS or OCI.

---

## 1. Quick Operations Cheat Sheet

| Task | Command |
| :--- | :--- |
| **Check service status** | `docker compose -f docker-compose.prod.yml ps` |
| **View live application logs** | `docker compose -f docker-compose.prod.yml logs -f web` |
| **View Nginx access & error logs**| `docker compose -f docker-compose.prod.yml logs -f nginx` |
| **Restart application gracefully** | `docker compose -f docker-compose.prod.yml restart web` |
| **Trigger manual database backup** | `./deploy/backup-db.sh` |
| **Deploy code updates** | `./deploy/deploy.sh` |
| **Check server resource usage** | `docker stats --no-stream` or `htop` |
| **Check disk space** | `df -h` |

---

## 2. Health Monitoring & Verification

The server exposes a health endpoint at `/api/health`.

### Expected 200 OK Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-11-06T21:40:00.000Z",
  "uptime_seconds": 86400,
  "database": "connected",
  "environment": "production",
  "version": "1.0.0",
  "memory_mb": {
    "rss": 42,
    "heapUsed": 18
  }
}
```

### Free External Uptime Monitoring
Set up a free monitor (e.g., [UptimeRobot](https://uptimerobot.com) or [Better Uptime](https://betterstack.com)):
- **Monitor Type**: HTTP(s)
- **URL**: `https://yourdomain.com/api/health`
- **Interval**: Every 1 to 5 minutes
- **Alert on**: HTTP status != 200

---

## 3. Database Maintenance & Disaster Recovery

### Automatic Backups
Backups run automatically every night at 3:00 AM via cron and are stored in `~/backups/` with a 14-day retention cycle.

### Manual Backup On-Demand
Before making major configuration changes or database updates, run:
```bash
./deploy/backup-db.sh
```

### Full Disaster Recovery (Restoring from Backup)

1. Stop the application container to avoid data corruption:
   ```bash
   docker compose -f docker-compose.prod.yml stop web
   ```

2. Locate the desired backup file:
   ```bash
   ls -lh ~/backups/
   ```

3. Extract and restore into the persistent volume:
   ```bash
   # Find the volume mount point on the host:
   DB_PATH=$(docker volume inspect ecommerce_app_data --format '{{ .Mountpoint }}')
   
   # Uncompress and overwrite the database:
   gunzip -c ~/backups/ecommerce_db_YYYYMMDD_HHMMSS.sqlite.gz | sudo tee "$DB_PATH/ecommerce.db" > /dev/null
   
   # Ensure correct file permissions:
   sudo chown 1000:1000 "$DB_PATH/ecommerce.db"
   ```

4. Start the application container:
   ```bash
   docker compose -f docker-compose.prod.yml start web
   ```

5. Verify health:
   ```bash
   curl http://localhost:3000/api/health
   ```

---

## 4. SSL Certificate Renewal & Management

Let's Encrypt certificates are valid for 90 days. The production `certbot` container in `docker-compose.prod.yml` runs an automated check twice daily (`sleep 12h & wait`) and renews certificates when they are within 30 days of expiry.

### Manual Forced Renewal
If you ever need to test or force an SSL certificate renewal:
```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew --force-renewal
docker compose -f docker-compose.prod.yml restart nginx
```

---

## 5. Security & OS Patching

### Automatic Security Patches
The bootstrap script enables `unattended-upgrades`. Critical Linux kernel and security patches are installed automatically without downtime.

### Manual Monthly Hygiene
Once a month, SSH into your server and run:
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get autoremove -y
docker system prune -f
```

---

## 6. Scaling & High Traffic Handling

If your e-commerce site experiences sudden viral traffic spikes (e.g. Black Friday or product launches):

1. **Nginx Micro-caching**:
   Static assets (CSS, JS, images) are already cached by Nginx with `expires 30d`.
2. **CPU & RAM Sizing**:
   - On OCI: Scale your Always-Free VM up to 4 OCPUs and 24GB RAM.
   - On AWS: Upgrade your Lightsail plan or EC2 instance to `t4g.medium` (2 vCPU, 4GB RAM) with one click in the AWS console.
3. **Cloudflare CDN (Recommended)**:
   Add Cloudflare in front of your domain for free global CDN edge caching, DDoS mitigation, and image optimization.
