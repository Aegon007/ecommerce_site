# OCI Deployment Guide: Production E-Commerce on Oracle Cloud

This guide explains how to host this e-commerce platform on **Oracle Cloud Infrastructure (OCI)** using Oracle's **Always Free Tier**, giving you a high-performance VM (up to 4 ARM64 cores, 24 GB RAM, 200 GB Storage) completely **free forever**.

---

## Step 1: Provision the OCI Always-Free Compute Instance

1. Log into your [Oracle Cloud Console](https://cloud.oracle.com/).
2. In the navigation menu (top-left burger icon), navigate to:
   **Compute** -> **Instances** -> Click **Create Instance**.
3. **Name**: `ecommerce-production`
4. **Placement**: Select any default Availability Domain.
5. **Image and Shape**:
   - Click **Change Image**: Select **Canonical Ubuntu 22.04** or **24.04 Minimal/Server**.
   - Click **Change Shape**:
     - Shape Series: **Ampere (ARM-based Processor)**.
     - Select **VM.Standard.A1.Flex** (Always Free Eligible).
     - Configure: **2 to 4 OCPUs** and **12 to 24 GB RAM** (all within Always Free allowance!).
6. **Networking**:
   - Create a new Virtual Cloud Network (VCN) or select your existing one.
   - Assign a public IPv4 address: Select **Automatically assign public IPv4 address**.
7. **Add SSH Keys**:
   - Choose **Generate a key pair** and download both private and public keys, OR paste your own existing public SSH key (`~/.ssh/id_rsa.pub`).
8. **Boot Volume**:
   - Default is 47 GB (Always Free allows up to 200 GB across your tenancy). You can set it to 100 GB.
9. Click **Create**. The instance will change state from "Provisioning" to green "Running" in ~60 seconds.

---

## Step 2: Configure OCI VCN Ingress Firewall Rules

OCI blocks incoming ports at the VCN subnet level by default. You **must** open ports 80 and 443 in your Security List:

1. In the Instance details page, click on the **Subnet** link under Primary VNIC.
2. Under "Security Lists", click on the **Default Security List for your VCN**.
3. Click **Add Ingress Rules**:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `80,443`
   - **Description**: `HTTP and HTTPS web traffic`
4. Click **Add Ingress Rules**.

---

## Step 3: Configure OCI Host Firewall (iptables on Ubuntu)

Ubuntu images on Oracle Cloud have an additional internal `iptables` rule that blocks ports 80 and 443 by default. Connect via SSH:

```bash
ssh -i your-private-key.key ubuntu@YOUR_OCI_PUBLIC_IP
```

Run these commands to allow HTTP/HTTPS traffic through the host OS:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## Step 4: Run Server Provisioning & Launch

### 1. Clone Project Repository
```bash
cd /opt
sudo git clone https://github.com/YOUR_USERNAME/ecommerce_website.git
sudo chown -R ubuntu:ubuntu /opt/ecommerce_website
cd /opt/ecommerce_website
```

### 2. Run Automated Bootstrap Script
```bash
chmod +x deploy/*.sh
./deploy/setup-server.sh
```

### 3. Setup Environment Variables
```bash
cp .env.example .env
nano .env
```
Ensure you configure:
- `NODE_ENV=production`
- `APP_URL=http://YOUR_OCI_PUBLIC_IP` (or your domain)
- Secure secrets for `JWT_SECRET` and `ADMIN_API_KEY`

### 4. Deploy Containers
```bash
./deploy/deploy.sh
```

Check running status:
```bash
docker compose -f docker-compose.prod.yml ps
```

Visit `http://YOUR_OCI_PUBLIC_IP` in your browser. Your store and admin dashboard are live!

---

## Step 5: Reserve a Static Public IP (Reserved Public IP)

By default, OCI public IPs are ephemeral (they might change if you terminate/recreate the VNIC). To ensure your IP is permanent:

1. Go to **Networking** -> **IP Management** -> **Reserved Public IPs**.
2. Click **Reserve Public IP Address**.
3. Name: `ecommerce-static-ip`.
4. Once reserved, click **Actions (three dots)** -> **Edit**.
5. Attach to your instance's Primary VNIC IP.

---

## Step 6: Free SSL with Let's Encrypt

Point your domain DNS (e.g. at Cloudflare or Namecheap) to your OCI Reserved Public IP.

Then run:
```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d yourdomain.com -d www.yourdomain.com \
  --email your-email@example.com --agree-tos --no-eff-email
```

Uncomment the HTTPS block in `docker/nginx.conf`, and reload:
```bash
docker compose -f docker-compose.prod.yml restart nginx
```
