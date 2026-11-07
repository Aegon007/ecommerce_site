#!/usr/bin/env bash
# ============================================================
# Cloud Server Bootstrap Script (AWS EC2 / Lightsail & OCI Compute)
# Compatible with Ubuntu 22.04 LTS / 24.04 LTS (x86_64 & ARM64)
# ============================================================

set -euo pipefail

echo "========================================================"
echo " Starting Cloud Server Provisioning for Apex Goods Co."
echo " Target OS: Ubuntu 22.04 / 24.04 (AWS or OCI)"
echo "========================================================"

# 1. Update OS packages
echo "[1/6] Updating system packages..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo apt-get install -y curl wget git ufw fail2ban ca-certificates gnupg lsb-release unattended-upgrades

# 2. Configure 2GB Swap Space (Essential for burst stability on small/free cloud VMs)
if [ ! -f /swapfile ]; then
    echo "[2/6] Configuring 2GB Swap space..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo 'vm.swappiness=15' | sudo tee -a /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' | sudo tee -a /etc/sysctl.conf
else
    echo "[2/6] Swap space already present. Skipping."
fi

# 3. Install Docker Engine and Docker Compose Plugin from official Docker repository
echo "[3/6] Installing official Docker & Docker Compose..."
if ! command -v docker &> /dev/null; then
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Enable and start Docker service
    sudo systemctl enable docker
    sudo systemctl start docker

    # Add current user to docker group (avoids sudo docker)
    sudo usermod -aG docker "$USER"
else
    echo "Docker already installed. Skipping."
fi

# 4. Configure UFW Firewall and Fail2Ban
echo "[4/6] Hardening Firewall (UFW) and Brute-force protection (Fail2Ban)..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
# Enable UFW non-interactively
sudo ufw --force enable

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

# 5. Enable Unattended Security Upgrades
echo "[5/6] Enabling automated security updates..."
sudo systemctl enable unattended-upgrades
sudo systemctl start unattended-upgrades

# 6. Setup Directory & Backup Cronjob
echo "[6/6] Setting up project backup cronjob..."
mkdir -p ~/backups

# Add daily backup at 3:00 AM if not already registered
(crontab -l 2>/dev/null | grep -v 'backup-db.sh'; echo "0 3 * * * /bin/bash $(pwd)/deploy/backup-db.sh >> ~/backups/backup.log 2>&1") | crontab -

echo "========================================================"
echo " Server Provisioning Complete!"
echo " Docker Version:  $(docker --version || echo 'Re-login to activate group')"
echo " Compose Version: $(docker compose version || echo 'Re-login to activate group')"
echo " Next step: Run ./deploy/deploy.sh to launch the application."
echo "========================================================"
