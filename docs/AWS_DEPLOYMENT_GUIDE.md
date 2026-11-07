# AWS Deployment Guide: Production E-Commerce Hosting

This guide walks you through deploying this e-commerce platform on **Amazon Web Services (AWS)** using either **Amazon Lightsail (Easiest)** or **AWS EC2 (Standard)**.

---

## Method A: Amazon Lightsail (Recommended for simplicity & fixed price)

Lightsail is AWS's streamlined VPS offering ($3.50 – $5.00/mo) with bundled SSD storage, DNS, and static IP.

### Step 1: Create a Lightsail Instance
1. Log in to the [AWS Management Console](https://console.aws.amazon.com/lightsail).
2. Click **Create instance**.
3. Select your instance location (choose the AWS region closest to your customers, e.g., `us-east-1` or `eu-west-1`).
4. Select platform: **Linux/Unix**.
5. Select blueprint: **OS Only** -> **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS**.
6. Select your instance plan:
   - **$3.50/mo** (512 MB RAM, 1 vCPU, 20 GB SSD) or
   - **$5.00/mo** (1 GB RAM, 1 vCPU, 40 GB SSD - recommended for smooth builds).
7. Enter an instance name (e.g. `apex-ecommerce-prod`) and click **Create instance**.

### Step 2: Attach a Static IP Address
1. Go to the **Networking** tab in Lightsail.
2. Click **Create static IP**.
3. Attach it to your `apex-ecommerce-prod` instance.

### Step 3: Configure Networking Firewall in Lightsail
In the Lightsail instance details, go to **Networking** -> **IPv4 Firewall** and ensure these ports are open:
- Port `22` (SSH)
- Port `80` (HTTP)
- Port `443` (HTTPS)

---

## Method B: AWS EC2 (Standard Production Virtual Machine)

If you prefer standard EC2:

1. In the EC2 Console, click **Launch Instance**.
2. **Name**: `ecommerce-production`
3. **AMI**: Ubuntu Server 24.04 LTS (HVM), SSD Volume Type.
4. **Architecture**: `64-bit (Arm)` (choose instance type `t4g.small` for best performance/price) or `64-bit (x86)` (`t3.micro` or `t3.small`).
5. **Key pair**: Create or select an existing SSH key pair (`.pem`).
6. **Network settings / Security Group**:
   - Check **Allow SSH traffic from Anywhere (0.0.0.0/0)** or your IP.
   - Check **Allow HTTP traffic from the internet (0.0.0.0/0)**.
   - Check **Allow HTTPS traffic from the internet (0.0.0.0/0)**.
7. **Storage**: Configure at least 20 GB gp3 volume.
8. Click **Launch Instance**.
9. In the EC2 Sidebar, navigate to **Network & Security** -> **Elastic IPs**, allocate an Elastic IP, and associate it with your EC2 instance so the IP never changes on reboot.

---

## Server Setup & Application Launch (Both Lightsail & EC2)

Connect to your server via SSH:
```bash
ssh -i your-key.pem ubuntu@YOUR_SERVER_PUBLIC_IP
```

### 1. Clone the Repository
```bash
cd /opt
sudo git clone https://github.com/YOUR_USERNAME/ecommerce_website.git
sudo chown -R ubuntu:ubuntu /opt/ecommerce_website
cd /opt/ecommerce_website
```

### 2. Run the Automated Server Provisioning Script
This installs Docker, Docker Compose, sets up swap space (crucial for small VMs), configures UFW firewall, and enables daily backups:
```bash
chmod +x deploy/*.sh
./deploy/setup-server.sh
```

### 3. Configure Production Environment Variables
```bash
cp .env.example .env
nano .env
```
Update:
- `NODE_ENV=production`
- `APP_URL=https://yourdomain.com` (or `http://YOUR_SERVER_IP` if testing without domain)
- `JWT_SECRET` (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `ADMIN_API_KEY` (set a private secure secret)

### 4. Deploy the Container Stack
```bash
./deploy/deploy.sh
```

Verify status:
```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3000/api/health
```

---

## Domain & Free SSL Setup with Let's Encrypt

1. Point your domain's DNS `A` record to your server's Public IP (in Amazon Route 53 or your registrar like Cloudflare/Namecheap):
   - `yourdomain.com` -> `YOUR_SERVER_PUBLIC_IP`
   - `www.yourdomain.com` -> `YOUR_SERVER_PUBLIC_IP`

2. Issue a free SSL certificate using Certbot:
```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d yourdomain.com -d www.yourdomain.com \
  --email your-email@example.com --agree-tos --no-eff-email
```

3. Enable HTTPS in `docker/nginx.conf`:
   Uncomment the HTTPS `server { ... }` block in `docker/nginx.conf`, replace `yourdomain.com` with your actual domain, and reload Nginx:
```bash
docker compose -f docker-compose.prod.yml restart nginx
```

Your site is now live with **A+ SSL security rating** at `https://yourdomain.com`!
