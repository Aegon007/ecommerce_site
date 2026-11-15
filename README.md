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

## Linux 部署（无需 Docker）

一台服务器可以直接运行 Node.js，由 systemd 保持服务运行，并由 Caddy 提供 HTTPS。已有 Nginx 等反向代理也可以沿用，只需将正式域名转发到 `127.0.0.1:3000`。

### 用脚本部署

在使用 systemd 的 Linux 服务器上，先安装可供系统用户使用的 Node.js 22.13+、npm、`curl` 和带 `caddy.service` 的 [Caddy](https://caddyserver.com/docs/install)。脚本也会用到 `ss` 和 `flock`，Ubuntu 上分别由 `iproute2` 和 `util-linux` 提供。将项目放在 `/opt/ecommerce_website`，让有 `sudo` 权限的部署账号拥有并能更新项目，同时给服务账号读取项目所需的目录和文件权限。

首次创建 `.env` 时，在项目目录执行 `install -m 600 .env.example .env`。编辑 `.env` 中的对应项，将域名换成你自己的，并填写初始密码及 [SMTP 配置](#inquiry-email)。已有上线数据时，保留数据库并让 `DB_PATH` 指向它。脚本使用 `/var/lib/apex-goods` 保存 SQLite，其他路径可按下方手动部署步骤配置权限和服务。

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://www.example.com
TRUST_PROXY=true
DB_PATH=/var/lib/apex-goods/ecommerce.db
ADMIN_PASSWORD=
SEED_DEMO_DATA=false
ENABLE_DEMO_CHECKOUT=false
```

把网站域名的 DNS 指向服务器，开放公网 `80/tcp` 和 `443/tcp`。通过 Cloudflare 管理 DNS 时，先按 [域名接入步骤](#cloudflare-domain) 添加灰云记录，等源站 HTTPS 可用再开启代理。

用项目所有者的账号运行命令。脚本从 `APP_ORIGIN` 读取主站域名，并在需要修改系统配置时使用 `sudo`。下例的参数是要跳转到主站的根域名。如果主站直接使用根域名，或只使用 `www`，省略该参数即可。

```bash
cd /opt/ecommerce_website
bash deploy/deploy-linux.sh example.com
```

脚本以专用账号运行应用，限制 `.env` 和数据库目录的访问权限，配置 `apex-goods.service` 并检查本机 `/api/health`，然后加载 Caddy 站点并启用开机启动。Caddy 会申请和续期证书。随后从外网验证 `curl -fsS https://www.example.com/api/health`、后台登录和询盘发信。[Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)

更新代码或 `.env` 后，重新执行同一命令，保留原来的跳转参数和 `DB_PATH`。脚本只替换带标记的站点配置块，保留 Caddy 的全局设置和其他站点。如果新配置加载失败，脚本会尝试恢复上一份 Caddyfile。若 Caddyfile 中已有手写的同名站点，请备份并移出旧块后再执行。部署异常时，用 `sudo journalctl -u apex-goods -u caddy -n 100 --no-pager` 查看日志。

### 手动部署

1. 将项目放在 `/opt/ecommerce_website`。安装 Node.js 22.13+、npm 和 [Caddy](https://caddyserver.com/docs/install)，创建专用系统用户和数据库目录。

   ```sh
   sudo useradd --system --home-dir /var/lib/apex-goods --shell /usr/sbin/nologin apex-goods
   sudo install -d -o apex-goods -g apex-goods -m 700 /var/lib/apex-goods
   sudo chown -R apex-goods:apex-goods /opt/ecommerce_website
   cd /opt/ecommerce_website
   sudo -u apex-goods npm ci --omit=dev
   ```

2. 如果还没有 `.env`，复制模板并按下面的示例编辑。`ADMIN_PASSWORD` 填你自己的初始密码。

   ```sh
   sudo -u apex-goods cp -n .env.example .env
   sudo chmod 600 .env
   sudoedit .env
   ```

   ```dotenv
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=3000
   APP_ORIGIN=https://www.example.com
   TRUST_PROXY=true
   DB_PATH=/var/lib/apex-goods/ecommerce.db
   ADMIN_PASSWORD="替换成至少 12 个字符的唯一密码"
   SEED_DEMO_DATA=false
   ENABLE_DEMO_CHECKOUT=false
   ```

3. 创建 `/etc/systemd/system/apex-goods.service`。用 `command -v node` 确认 Node 的绝对路径，确保服务用户能执行它。

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

4. 将域名的 DNS 指向服务器，开放公网 `80` 和 `443`，应用端口 `3000` 保持本机访问。将下面的站点块加入 `/etc/caddy/Caddyfile`，域名与 `APP_ORIGIN` 一致。Caddy 会申请和续期证书。使用 Cloudflare 时，按下方步骤设置 DNS、HTTPS 和访客 IP。[接入域名和 Cloudflare](#cloudflare-domain) · [Caddy HTTPS 条件](https://caddyserver.com/docs/automatic-https)

   ```caddyfile
   www.example.com {
       reverse_proxy 127.0.0.1:3000 {
           header_up X-Real-IP {http.request.remote.host}
       }
   }
   ```

   ```sh
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   curl -fsS https://www.example.com/api/health
   ```

   `TRUST_PROXY=true` 只用于应用端口不公开、且反向代理会覆盖 `X-Real-IP` 的部署。否则设为 `false`，应用按实际连接地址限流。现有 Nginx 可以用 `proxy_set_header X-Real-IP $remote_addr;`，并保留原始 Host。

部署后打开正式域名的 `/admin.html` 上架真实商品，按下方配置询盘发信。更新代码后重新执行 `npm ci --omit=dev`，再执行 `sudo systemctl restart apex-goods`。用 `journalctl -u apex-goods -n 100 --no-pager` 查启动和发信错误。

## Docker Compose 部署（可选）

服务器已经装有 Docker 时，可以让 Compose 安装 Node 依赖并管理应用进程。使用同一份 `.env`，至少填写 `APP_ORIGIN` 和 `ADMIN_PASSWORD`，然后执行：

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 web
curl -fsS http://127.0.0.1:3000/api/health
```

默认 `docker-compose.yml` 将 Web 端口绑定在主机的 `127.0.0.1:3000`，可直接使用上面的 Caddy 配置。容器将数据库保存在 `ecommerce_data` 卷内。修改 `.env` 后执行 `docker compose up -d --force-recreate web`，让容器读取新配置。更新代码用 `docker compose up -d --build`。

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

更新 `.env`，将 `APP_ORIGIN` 设为 `https://www.example.com`，并保留 `TRUST_PROXY=true`。改完后按上面的部署方式重启应用，Compose 部署则重新创建 `web` 容器。登录和询盘提交都会校验请求来源，因此主地址要与 `APP_ORIGIN` 完全一致。

如果运行部署脚本时传了 `example.com`，它已经配置好根域名跳转。手动配置 Caddy 时，保留上面的 `www.example.com` 反向代理块，再加入下面的跳转。Caddy 会为这两个域名配置 HTTPS。

```caddyfile
example.com {
    redir https://www.example.com{uri} permanent
}
```

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
