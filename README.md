# Apex Goods Co.

A product catalog and inquiry site with a Node.js server, SQLite, and a private admin inbox. Visitors can browse product details and send general or product-specific inquiries. The frontend uses plain HTML, CSS, and JavaScript.

## 本地启动

需要 **Node.js 22.13 或更高版本**和 npm。在项目根目录执行 `npm ci` 安装依赖。SQLite 随 Node.js 提供，项目首次启动时会创建数据库。

Windows 双击 `run.bat`，也可以在 PowerShell 执行：

```powershell
.\run.ps1
```

Linux 可在前台启动：

```sh
sh ./run.sh
```

打开 [产品展示](http://localhost:3000)、[询盘表单](http://localhost:3000/contact.html) 或 [管理员后台](http://localhost:3000/admin.html)。如果 3000 已占用，先停止旧服务，或在 `.env` 更换 `PORT`。

## 先在 Ubuntu 服务器上测试

这一步只需要 Windows 11 能通过 SSH 登录 Ubuntu 20.04。网站运行在服务器上，你在 Windows 浏览器里测试。域名、`.env` 和 Caddy 都可以等测试通过后再配置。

### 1. 从 Windows 登录并打开测试通道

在 **Windows PowerShell** 里运行下面的命令。把示例 IP、用户名和私钥路径换成平时登录服务器用的值。已有 SSH 登录命令时，给它加上 `-L 127.0.0.1:3300:127.0.0.1:3000` 即可。如果 `ssh` 命令找不到，在 Windows **可选功能**中安装 **OpenSSH 客户端**。[Windows OpenSSH 安装](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse) · [SSH 端口转发](https://man.openbsd.org/ssh#L)

```powershell
ssh -o ExitOnForwardFailure=yes -L 127.0.0.1:3300:127.0.0.1:3000 -i "C:\Users\你的用户名\Downloads\server-key.pem" ubuntu@203.0.113.10
```

这个 SSH 通道会把你电脑的 `3300` 端口接到服务器本机的 `3000` 端口。登录后继续在同一个窗口执行下面的 Linux 命令。

### 2. 确认服务器有 Node.js 和 npm

运行 `node -v` 和 `npm -v`。Node.js 负责运行网站后端，npm 负责安装项目依赖。已有 Node.js 22.13 或以上且 npm 能用，就可以直接做下一步。

<details>
<summary>还没装 Node.js 和 npm，展开看安装命令</summary>

在 Ubuntu 20.04 的 64 位服务器上，用 `apt` 安装 NodeSource 提供的 Node.js 24 LTS。该软件包包含 npm。下面也会安装下载代码和配置软件源所需的工具。[NodeSource 兼容列表](https://github.com/nodesource/distributions/blob/master/DEV_README.md#deb-supported-versions) · [NodeSource 软件源配置](https://github.com/nodesource/distributions/blob/master/scripts/deb/setup_24.x)

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
```

```bash
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | sudo gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
sudo chmod 644 /etc/apt/keyrings/nodesource.gpg
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main\n' "$(dpkg --print-architecture)" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list > /dev/null
sudo apt update
sudo apt install -y nodejs
```

确认 `node` 显示 `v24.x.x`、`npm` 显示版本号、`command -v node` 显示 `/usr/bin/node`。最后一条检查内置 SQLite，成功时不会打印内容。

```bash
node --version
npm --version
command -v node
node --no-warnings -e "require('node:sqlite')"
```

</details>

### 3. 进入项目目录

已有代码时，直接进入现在的目录，例如 `cd /opt/ecommerce_site`。运行 `ls package.json run.sh`，能看到这两个文件就可以继续。`/opt` 是 Linux 上放额外安装的软件的一种常见选择。也可以用 `/srv/ecommerce_site` 或其他目录，后面的命令都在你实际的项目目录里执行。[Linux 目录约定](https://refspecs.linuxfoundation.org/FHS_3.0/fhs-3.0.html)

<details>
<summary>提示 Permission denied，怎么修？</summary>

在项目目录执行 `ls -ld .`，查看目录所有者。`sudo test -e .env || install ...` 中的 `sudo` 只作用于 `test`，创建文件的 `install` 仍由当前账号执行。这个项目的目录应由你用来部署的 SSH 账号管理，这样 npm 才能在里面安装依赖，后面也能创建 `.env`。

如果 `/opt/ecommerce_site` 确实是你要部署的项目，且当前目录归 `root` 或其他账号，执行下面一条，把这个目录交给当前 SSH 账号。

```bash
sudo chown "$(id -un):$(id -gn)" /opt/ecommerce_site
```

如果这是刚用 `sudo git clone` 下载的项目，且整个项目里的文件也都归 `root`，可以把下列命令用于这个新检出的项目目录。它会一并修正 `.git` 和项目内文件的所有者。

```bash
sudo chown -R --no-dereference "$(id -un):$(id -gn)" /opt/ecommerce_site
```

如果之前已经用 `sudo` 创建了普通文件 `.env`，在项目目录用 `sudo chown "$(id -un)" .env` 把它交给当前账号，再用 `nano .env` 编辑。首次测试可以先跳过创建 `.env`。

</details>

<details>
<summary>服务器上还没有代码，展开看下载步骤</summary>

先把最新代码推送到 GitHub。如果服务器还没有 `git`，运行 `sudo apt install git`。`sudo install -d` 创建目录并交给当前账号。`git clone` 最后的 `.` 表示克隆到当前目录。

```bash
sudo install -d -m 0755 -o "$(id -un)" -g "$(id -gn)" /opt/ecommerce_website
cd /opt/ecommerce_website
git clone https://github.com/Aegon007/ecommerce_site.git .
ls -l package.json deploy/deploy-linux.sh
```

如果用了另一个仓库，从仓库页面点 **Code → HTTPS** 复制地址。私有仓库可使用下面的部署密钥流程。

用一把只供此仓库读取的部署密钥。先在**服务器**上生成密钥。提示输入短语时，可以为此密钥设置密码；以后手动拉取代码时需要解锁它。

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C 'ecommerce-server-deploy' -f ~/.ssh/ecommerce_github
cat ~/.ssh/ecommerce_github.pub
```

复制 `cat` 显示的那一行公钥，到 GitHub 该仓库的 **Settings → Deploy keys → Add deploy key** 添加，**Allow write access** 保持未勾选。然后在服务器执行以下命令替代 HTTPS 克隆。第一次连接 GitHub 时，对照官方指纹再接受连接。[GitHub 部署密钥](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) · [GitHub SSH 指纹](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints)

```bash
cd /opt/ecommerce_website
git clone -c core.sshCommand="ssh -i $HOME/.ssh/ecommerce_github -o IdentitiesOnly=yes" \
  git@github.com:Aegon007/ecommerce_site.git .
ls -l package.json deploy/deploy-linux.sh
```

</details>

### 4. 启动网站并在浏览器检查

在服务器的项目目录运行下面的命令。`npm ci` 安装依赖，成功后启动测试版。测试商品和询盘保存在 `data/preview.db`，此时提交询盘只会保存记录。

```bash
npm ci && HOST=127.0.0.1 PORT=3000 NODE_ENV=development APP_ORIGIN=http://127.0.0.1:3300 \
  DB_PATH=data/preview.db SEED_DEMO_DATA=true ADMIN_PASSWORD=123 \
  ENABLE_DEMO_CHECKOUT=false TRUST_PROXY=false SMTP_HOST= sh ./run.sh
```

终端看到 `Apex Goods: http://localhost:3000` 后，保持 SSH 窗口打开，在 **Windows 浏览器**访问 [网站首页](http://127.0.0.1:3300/)。用 `admin` / `123` 登录 [测试后台](http://127.0.0.1:3300/admin.html)，再到 [询盘页](http://127.0.0.1:3300/contact.html) 提交一条留言，确认它出现在后台的 **Inquiries**。如果这份测试数据库已经改过密码，使用改过的密码。

测试完成后，在 SSH 窗口按 **Ctrl+C** 停止网站，释放服务器的 `3000` 端口。

## 测试通过后再部署正式网站（无需 Docker）

### 1. 安装 Caddy

Caddy 接收公网请求，把请求转给本机的 Node.js，并自动申请 HTTPS 证书。部署脚本还会配置 Ubuntu 自带的 systemd，让网站随服务器启动。继续使用 Ubuntu 20.04 上线时，先查看下方的[上线安全设置](#上线安全设置)，确认该系统能收到安全补丁。

<details>
<summary>展开查看 Ubuntu 20.04 的 Caddy 安装命令</summary>

在服务器上执行。最后一条应显示 `active`。安装失败时用 `sudo journalctl -u caddy -n 50 --no-pager` 查看日志。[Caddy 官方安装说明](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg nano debian-keyring debian-archive-keyring \
  apt-transport-https iproute2 util-linux dnsutils ufw
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
  /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
caddy version
systemctl is-active caddy
```

</details>

### 2. 填写 `.env` 并连接域名

`.env` 是服务器上的配置文件，用来保存正式域名、初始管理员密码和 SMTP 发信设置。它以 `.` 开头，是隐藏文件，可以用 `ls -a` 查看文件名。下面从模板创建 `.env`，已有文件时直接打开编辑。

```bash
(test -e .env || install -m 600 .env.example .env) && nano .env
```

在 nano 里找到以下设置，改成示例的格式。模板中某一行以 `#` 开头时，去掉该行开头的 `#` 才会生效。把 `www.example.com` 换成你的主站域名，`https://` 保留，地址末尾无需加 `/`。首次创建数据库时，把 `ADMIN_PASSWORD=""` 的引号内填上至少 **12 个字符**的独立密码，默认登录名是 `admin`。

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://www.example.com
TRUST_PROXY=true
DB_PATH=/var/lib/apex-goods/ecommerce.db
ADMIN_PASSWORD=""
SEED_DEMO_DATA=false
ENABLE_DEMO_CHECKOUT=false
```

保存时按 **Ctrl+O**，按 **Enter** 确认文件名，再按 **Ctrl+X** 退出。`HOST=127.0.0.1` 让 Node.js 只接受服务器本机的连接，由 Caddy 对外服务。`DB_PATH` 是数据库文件的位置，第一次部署时会自动创建。已有正式数据时继续用原来的数据库，脚本部署的数据库放在 `/var/lib/apex-goods/` 下。需要发邮件时在同一个文件补齐 [SMTP 设置](#inquiry-email)。

域名要先通过 DNS 指向服务器。在管理该域名 DNS 的平台上，为根域名 `@` 增加 `A` 记录，填服务器公网 IPv4，再为 `www` 增加 `CNAME` 记录，填你的根域名。如果使用 Cloudflare，按 [域名接入的第 1、2 步](#cloudflare-domain) 添加记录，初次部署选 **DNS only**（灰云）。可以在服务器用 `dig +short A www.example.com` 核对解析结果是否包含服务器公网 IP，记得替换域名。

在云平台控制台找到**防火墙**或**安全组**的入站规则，开放网站用的 `80/tcp` 和 `443/tcp`，保留现有的 SSH 规则。应用的 `3000` 只供本机使用。Ubuntu 上可以用 `sudo ufw status` 检查本机防火墙。如果它显示 `Status: active`，还要运行下面两条命令。[Ubuntu 防火墙说明](https://ubuntu.com/server/docs/how-to/security/firewalls/)

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 3. 运行部署脚本并验证

继续使用先前的普通 SSH 账号，在项目目录运行脚本。正式服务也要能运行 Node.js。如果测试时用的是仅为自己安装的 Node.js，可按上面的 `apt` 安装步骤配置系统版本。脚本需要修改系统配置时会调用 `sudo`。

如果 `.env` 里用了 `https://www.example.com`，下面的参数 `example.com` 会把裸域名跳转到 `www`。换成你自己的根域名。如果主站直接用裸域名，或只配置了 `www` 这一条 DNS，运行 `bash deploy/deploy-linux.sh` 即可。

```bash
bash deploy/deploy-linux.sh example.com
```

脚本会用 npm 按 `package-lock.json` 安装网站依赖，创建专用账号 `apex-goods` 和数据库目录，配置网站的 systemd 服务和 Caddy。出现 `Local health check passed` 表示服务器本机的网站已运行。Caddy 接下来会用你的域名自动申请和续期证书。[Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)

```bash
systemctl is-active apex-goods caddy
curl -fsS http://127.0.0.1:3000/api/health
```

两个服务都应显示 `active`。`curl` 应返回包含 `"status":"healthy"` 和 `"database":"connected"` 的内容。再回到自己电脑的浏览器，用真实域名访问 `https://www.example.com`、`https://www.example.com/admin.html` 和 `https://www.example.com/contact.html`，实际登录后台并提交一条测试询盘。配置了 SMTP 时，也核对业务邮箱。使用 Cloudflare 时，确认源站的 HTTPS 已可访问，再按 [Cloudflare 第 3、4 步](#cloudflare-domain) 开启代理并复测。

### 日后更新和排查

新代码已推送到 GitHub 后，在服务器执行下面的命令。保留原来的 `DB_PATH` 和跳转参数。仅修改 `.env` 时，重新运行最后一条命令即可。

```bash
git pull --ff-only
bash deploy/deploy-linux.sh example.com
```

如果部署或 HTTPS 检查有问题，在服务器查看日志。脚本会保留 Caddy 的全局设置和其他站点，已有手写的同名站点配置时请先备份，再移出旧块。

```bash
sudo journalctl -u apex-goods -u caddy -n 100 --no-pager
```

<a id="manual-linux-deploy"></a>

<details>
<summary>手动部署（需要自己维护服务配置时）</summary>

安装 Caddy、配置域名和 `.env` 后，可用下面的步骤手动配置服务。用部署脚本时可以跳过本节。

1. 创建让 systemd 运行网站的专用账号 `apex-goods`、给它数据库目录和 `.env` 的读取权限，再用当前登录账号安装项目依赖。日常登录服务器仍使用原来的 SSH 账号。

   ```sh
   id -u apex-goods >/dev/null 2>&1 || \
     sudo useradd --system --user-group --home-dir /var/lib/apex-goods --shell /usr/sbin/nologin apex-goods
   sudo install -d -o apex-goods -g apex-goods -m 0700 /var/lib/apex-goods
   sudo chgrp apex-goods .env
   chmod 640 .env
   npm ci --omit=dev --ignore-scripts
   ```

2. 运行 `sudo nano /etc/systemd/system/apex-goods.service`，粘贴下面的内容并保存。把 `WorkingDirectory` 和 `ExecStart` 中的 `/opt/ecommerce_website` 换成你的实际项目路径。用 `command -v node` 确认 `/usr/bin/node` 是否与你的 Node 路径一致。

   ```ini
   [Unit]
   Description=Apex Goods product catalog
   After=network.target

   [Service]
   User=apex-goods
   Group=apex-goods
   WorkingDirectory=/opt/ecommerce_website
   ExecStart=/usr/bin/node /opt/ecommerce_website/src/server.js
   Restart=on-failure
   UMask=0077
   NoNewPrivileges=true

   [Install]
   WantedBy=multi-user.target
   ```

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now apex-goods
   curl -fsS http://127.0.0.1:3000/api/health
   ```

3. 运行 `sudo nano /etc/caddy/Caddyfile`，将下面的站点块加到文件末尾，替换站点和跳转中的示例域名。网站主地址要与 `.env` 中的 `APP_ORIGIN` 一致。如果只配置了一个域名，保留主站的 `reverse_proxy` 块即可。如果文件里已经有同名站点，编辑已有的那一块。

   ```caddyfile
   example.com {
       redir https://www.example.com{uri} permanent
   }

   www.example.com {
       reverse_proxy 127.0.0.1:3000 {
           header_up X-Real-IP {client_ip}
       }
   }
   ```

   保存后检查配置。`caddy validate` 成功后再重新加载 Caddy，检查公开的 HTTPS 地址。

   ```sh
   sudo -u caddy caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   curl -fsS https://www.example.com/api/health
   ```

   `TRUST_PROXY=true` 只用于应用端口不公开、且反向代理会覆盖 `X-Real-IP` 的部署。否则设为 `false`，应用按实际连接地址限流。现有 Nginx 可以用 `proxy_set_header X-Real-IP $remote_addr;`，并保留原始 Host。

使用 Cloudflare 时，按 [域名接入步骤](#cloudflare-domain) 配置 HTTPS 和访客 IP。手动部署后更新代码，在项目目录重新执行 `npm ci --omit=dev --ignore-scripts`，再执行 `sudo systemctl restart apex-goods`。

</details>

## Docker Compose 部署（可选）

服务器已经装有 Docker 时，可以让 Compose 安装 Node 依赖并管理应用进程。使用同一份 `.env`，至少填写 `APP_ORIGIN` 和 `ADMIN_PASSWORD`，然后执行：

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 web
curl -fsS http://127.0.0.1:3000/api/health
```

默认 `docker-compose.yml` 将 Web 端口绑定在主机的 `127.0.0.1:3000`，可展开 [手动部署](#manual-linux-deploy)，按第 3 步配置主机上的 Caddy。容器将数据库保存在 `ecommerce_data` 卷内。修改 `.env` 后执行 `docker compose up -d --force-recreate web`，让容器读取新配置。更新代码用 `docker compose up -d --build`。

如果已经使用 `docker-compose.prod.yml`，继续在命令中加 `-f docker-compose.prod.yml`，沿用原来的数据库卷和 Nginx。该文件里的 Nginx HTTPS 示例需要填入正式域名和证书路径。切换 Compose 文件会切换数据库卷，迁移前先备份。重启或更新时请保留数据库卷。

<a id="cloudflare-domain"></a>

## 接入已注册的域名和 Cloudflare

这里以 `www.example.com` 为网站主地址，`example.com` 自动跳转到 `www`。把示例域名和 IP 换成你自己的。上面的 Linux 直接部署和 Docker Compose + Caddy 都可以按这个流程配置。

### 1. 将域名交给 Cloudflare 解析

在 Cloudflare 控制台添加根域名 `example.com`。对照原 DNS 服务逐项核对导入的记录，尤其是邮箱用的 `MX`、发信服务要求的 SPF、DKIM、DMARC 和域名验证记录。邮件主机的 `A`、`AAAA` 或 `CNAME` 保持 **DNS only**（灰云）。[Cloudflare DNS 接入指南](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

如果原来开了 DNSSEC，先在注册商处停用旧 DNSSEC。然后在注册商将原有域名服务器替换为 Cloudflare 分配的两条 **Nameserver**，等控制台显示 **Active**。如需确认，可运行 `dig +short NS example.com`。域名仍在原注册商续费，DNSSEC 可以在激活后重新启用。域名已经由 Cloudflare 解析时，可以直接配置下一步。[Cloudflare DNSSEC 指南](https://developers.cloudflare.com/dns/dnssec/)

### 2. 将网站域名指向服务器

在 Cloudflare 的 **DNS → Records** 添加或更新以下记录。先用灰云直连服务器，让 Caddy 为两个域名申请证书，并确认网站可访问。

| 类型 | 名称 | 目标 | 初始代理状态 |
| --- | --- | --- | --- |
| `A` | `@` | 服务器公网 IPv4，例如 `203.0.113.10` | DNS only（灰云） |
| `CNAME` | `www` | `example.com` | DNS only（灰云） |

服务器能通过公网 IPv6 提供网站时，也可以为 `@` 添加 `AAAA` 记录。确认服务器防火墙和云平台安全组开放 `80` 和 `443`。

在 `.env` 中将 `APP_ORIGIN` 设为正式地址 `https://www.example.com`，并保留 `TRUST_PROXY=true`。登录和询盘提交都会校验请求来源，因此主地址要与 `APP_ORIGIN` 完全一致。首次部署时，DNS 验证通过后回到部署教程启动网站。已有服务改了 `.env` 时按原部署方式重新加载。

如果运行部署脚本时传了 `example.com`，它会配置根域名跳转。手动配置 Caddy 时，展开 [手动部署](#manual-linux-deploy)，按第 3 步配置主站和跳转。

### 3. 配置访客 IP 和 HTTPS 代理

启用代理前，将下面的 `servers` 设置放进 Caddyfile 开头的全局 `{ ... }` 块。将 `<CLOUDFLARE_CIDRS>` 替换为 Cloudflare 官方列表的全部 IPv4 和 IPv6 网段，用空格分隔。这个设置让 Caddy 只从受信任的 Cloudflare 连接读取 `CF-Connecting-IP`。[Cloudflare 网段](https://www.cloudflare.com/ips/) · [Caddy 可信代理设置](https://caddyserver.com/docs/caddyfile/options#trusted-proxies)

```caddyfile
{
    servers {
        trusted_proxies static <CLOUDFLARE_CIDRS>
        client_ip_headers CF-Connecting-IP
    }
}
```

部署脚本生成的代理块已使用 `header_up X-Real-IP {client_ip}`。手动配置 Caddy 时，将 `www.example.com` 代理块中的 `header_up` 更新为这一行，让应用按访客 IP 对登录和询盘限流。使用 Nginx 时，让证书覆盖两个域名并把根域名跳转到 `www`，再使用 `set_real_ip_from` 配置 Cloudflare 网段及 `real_ip_header CF-Connecting-IP;`，继续用 `$remote_addr` 向应用传递解析后的 IP。[Nginx Real IP 模块](https://nginx.org/en/docs/http/ngx_http_realip_module.html)

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -fsS https://www.example.com/api/health
curl -sSI https://example.com/
```

确认健康检查返回成功、根域名跳转到 `https://www.example.com/`。在 Cloudflare 的 **SSL/TLS → Overview** 将加密模式设为 **Full (strict)**，它会校验源站的 HTTPS 证书。[Full (strict) 模式](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)

把网站记录 `@` 和 `www` 改成 **Proxied**（橙云）。如果也加了网站的 `AAAA`，一起开启代理。到 **SSL/TLS → Edge Certificates** 确认 Universal SSL 边缘证书已生效。使用 Caddy 的 HTTP 验证自动续期时，让 `/.well-known/acme-challenge/*` 正常到达 Caddy，避免对此路径加缓存或验证挑战。[Cloudflare 代理状态](https://developers.cloudflare.com/dns/proxy-status/)

### 4. 验证上线

- 在外网运行 `curl -sSI https://www.example.com/`，检查响应头中有 `cf-ray`。再访问 `/api/health`，确认应用正常响应。[Cloudflare 响应头](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-ray)
- 用正式域名打开 `/admin.html` 登录。到 `/contact.html` 提交一条测试询盘，确认后台能查到，业务邮箱也收到通知。自定义 Cloudflare 缓存规则时，避开 `/admin.html` 和 `/api/*`。
- **522** 时检查 DNS 指向的公网 IP、Caddy 或 Nginx 进程，以及防火墙是否允许 Cloudflare 连接服务器。**526** 时检查源站证书是否过期、是否覆盖访问的域名，以及证书链是否完整。[Cloudflare 522 排查](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/) · [Cloudflare 526 排查](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/)

## 更换商品图片

在 `/admin.html` 登录后，进入 **Product catalog**，新增商品或点击要更换图片的商品旁的 **Edit**。在 **Product image** 选取电脑里的照片，用缩放、水平和垂直滑块调整取景，确认预览后保存商品。点击 **Clear selection** 可撤销这次选图。

支持 JPG、PNG 和 WebP，单个原图最多 10 MB，至少 400 × 320 像素，每边最多 6,000 像素且总像素最多 2,400 万。封面按 5:4 裁剪，保存为 1,000 × 800 的 WebP。已有图片会显示在编辑框中，修改其他商品字段时可以直接保存。上传的图片随 SQLite 数据库一起备份。

## 管理员账号和安全

- 默认账号是 `admin`。新建开发数据库时可以用 `123`；生产模式会拒绝这个默认密码。`ADMIN_PASSWORD` 仅用于新数据库初始化，已有密码保存在数据库里。
- 登录后点击 **Change Password**，输入当前密码和两次新密码。新密码至少 12 个字符。更新后所有旧会话都会注销，请重新登录。
- 管理员会话用 `HttpOnly`、`SameSite=Strict` Cookie，生产环境额外使用 `Secure`。写入接口校验请求来源，登录、改密和公开询盘有限流。数据查询用绑定参数，动态列和排序从代码中的允许列表选取。页面通过内容安全策略限制脚本来源。
- 如果忘了密码，可以从服务器终端重置。下面在 Bash 中读取密码且不回显，再传给重置脚本。以运行应用的用户执行，避免数据库文件权限问题。

  ```bash
  IFS= read -r -s -p 'New admin password: ' NEW_ADMIN_PASSWORD
  printf '\n'
  printf '%s\n' "$NEW_ADMIN_PASSWORD" | sudo -u apex-goods node src/reset-admin-password.js
  unset NEW_ADMIN_PASSWORD
  ```

  Docker 部署时，将上面的 `sudo -u apex-goods node` 换成 `docker compose exec -T web node`，并使用部署时的 Compose 文件。重置会撤销全部管理员会话。

### 上线安全设置

<details>
<summary>Ubuntu 20.04 怎样继续获取系统安全更新？</summary>

Ubuntu 20.04 已结束常规安全维护。继续用这版系统对外运行网站时，可通过 Ubuntu Pro 的扩展安全维护（ESM）获取系统补丁。先运行 `pro status`。若找不到 `pro`，运行 `sudo apt update` 和 `sudo apt install ubuntu-advantage-tools`。

若显示尚未绑定，运行 `sudo pro attach`，在浏览器打开终端给出的网址，按提示绑定。再用 `pro status` 检查 `esm-infra` 和 `esm-apps`。对尚未启用的项目，分别运行 `sudo pro enable esm-infra` 或 `sudo pro enable esm-apps`。最后运行 `sudo apt update` 和 `sudo apt upgrade` 安装更新。[Ubuntu 20.04 支持周期](https://ubuntu.com/project/docs/release-team/list-of-releases/#expanded-security-maintenance) · [Ubuntu Pro 绑定步骤](https://ubuntu.com/pro-client/docs/en/docs/tutorials/basic_commands/)

</details>

1. **限制公网端口。** 在云安全组和服务器防火墙，只放行网站用的 `80/tcp`、`443/tcp`，以及从运维 IP 或 VPN 网段访问的 SSH。应用端口默认是 `3000`，绑定在 `127.0.0.1`。SSH 使用密钥和普通账号，确认另一条 SSH 会话能用密钥登录后，再关闭密码登录和 root 远程登录。[Ubuntu OpenSSH 配置](https://ubuntu.com/server/docs/how-to/security/openssh-server/)
2. **保护后台和账户。** 网站后台使用独立的强密码。为云平台、域名注册商和 Cloudflare 账户开启多因素认证。后台只供团队使用时，可用 Cloudflare Access 同时保护 `/admin.html` 和 `/api/admin/*`，只允许团队身份登录，并给身份提供商开启 MFA。[Cloudflare Access 路径设置](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) · [Cloudflare 双重认证](https://developers.cloudflare.com/fundamentals/user-profiles/2fa/)
3. **减少垃圾请求和代理绕过。** 启用橙云和 **Full (strict)** 后，查看 Cloudflare WAF 的安全事件。遭遇集中尝试时，可对 `POST /api/admin/login` 或 `POST /api/inquiries` 添加针对性的限流规则，并复测正常询盘。若使用 WAF 或 Access 拦截请求，在确认 HTTPS、证书续期验证路径和管理访问正常后，可在源站安全组把网站端口进一步限制为 Cloudflare 的 IPv4、IPv6 网段，防止访客通过公网 IP 绕过代理。变更后复测网站、后台和询盘。[Cloudflare WAF](https://developers.cloudflare.com/waf/get-started/) · [保护源站](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/)
4. **持续打补丁并备份。** 启用系统安全更新，定期更新 Node.js、Caddy 和 npm 依赖。将 `.env`、SMTP 密钥和 SQLite 备份存放在受限位置，把备份加密保存到另一台主机或私有存储，并定期试恢复。在 Cloudflare 安全事件里查看异常流量和限流命中，在服务日志里排查证书、启动和发信错误。[Ubuntu 自动安全更新](https://ubuntu.com/server/docs/how-to/software/automatic-updates/)

## 其他配置与备份

`.env` 从项目根目录自动读取。服务进程里已经设置的同名变量优先。

- `DB_PATH`: defaults to `data/ecommerce.db`, resolved relative to the project folder.
- `ENABLE_DEMO_CHECKOUT=false`: catalog and inquiries mode. The value `true` enables the legacy demo checkout routes for local testing, accessible directly at `/cart.html`.
- `SEED_DEMO_DATA=true`: fills a new, empty database with the example catalog, reviews, promo codes, and sample orders. Development does this by default. Production does not seed by default.
- `NODE_ENV=production`: when initializing a new production database, `ADMIN_PASSWORD` must be at least 12 characters.

数据库结构会随程序启动升级。上线后应定期备份并试恢复。直接部署可以用以下命令创建包含已提交 WAL 数据的一致性快照。输出路径应位于现有、仅运维账号可读的目录，并使用新的文件名。

```sh
sudo -u apex-goods node src/backup-db.js /var/lib/apex-goods/ecommerce-backup.db
```

也可以执行 `bash deploy/backup-db.sh`，适用于直接部署或 Docker，会在 `BACKUP_DIR`（默认 `~/backups`）生成压缩快照。把备份保存到服务器之外。恢复时先保留现有数据库与 WAL 文件，在独立目录解压备份并验证，再由停服后的实例切换到恢复文件。

<a id="inquiry-email"></a>

## 询盘邮件

在 `.env` 中填写发信服务提供的 SMTP 配置和你们的收件地址，保存后重启服务。下面以验证过发件域名的 Resend 为例，发件地址无需单独开通邮箱。生产密钥只放在服务器配置中。[Resend SMTP 配置](https://resend.com/docs/send-with-smtp)

```dotenv
INQUIRY_TO=sales@example.com
INQUIRY_FROM=inquiries@notify.example.com
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS="替换成发信密钥"
```

如果服务商提供 `587` 端口，配置 `SMTP_SECURE=false`，应用会要求 STARTTLS。已有可信 SMTP 中继也可以同时省略 `SMTP_USER` 和 `SMTP_PASS`。

系统先把询盘保存到数据库，再尝试发信。收到邮件后可以直接回复客户。若发信失败，在后台 **Inquiries** 打开该条留言查看邮件状态，修好 SMTP 配置后点击 **Retry notification**。

配置完成后提交一次测试询盘，同时核对后台记录和业务邮箱是否收到邮件。

## Verification

```sh
node --test
```

The tests cover catalog and inquiry endpoints, email notification and retry, and the legacy demo checkout.

前端不需要构建。也可使用 `npm start`、`npm run dev` 和 `npm test`。测试数据库与运行数据隔离。

## Files

- `src/server.js`: routes, sessions, static serving, and admin operations.
- `src/commerce.js`: checkout validation, pricing, order creation, and product validation.
- `src/inquiries.js`: inquiry validation, storage, notification and inbox queries.
- `src/db.js`: SQLite schema, compatible migrations, and password hashing.
- `src/config.js`: `.env` and shared store configuration.
- `public/`: storefront and store manager.
- `test/store.test.js`: isolated regression tests.
- `.backups/before-improvements.zip`: original source, pages, launchers, README, and example configuration before this revision.

上线验收时，用正式域名登录后台、提交一条询盘，确认后台可查且业务邮箱实际收到通知。店铺当前以产品展示和询盘为主，演示下单路由默认关闭。
