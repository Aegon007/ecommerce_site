#!/usr/bin/env bash
set -euo pipefail

usage() {
    printf 'Usage: bash deploy/deploy-linux.sh [redirect-domain]\n'
    printf 'The primary domain comes from APP_ORIGIN in .env.\n'
}

fail() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
    usage
    exit 0
fi
[[ $# -le 1 ]] || { usage >&2; exit 1; }
[[ $(uname -s) == Linux ]] || fail 'Run this script on the Linux server.'
[[ $EUID -ne 0 ]] || fail 'Run as the project owner without sudo. The script uses sudo for system changes.'

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
app_dir=$(pwd -P)
env_file="$app_dir/.env"
app_user=apex-goods
service=apex-goods.service
unit_file="/etc/systemd/system/$service"
caddy_file=/etc/caddy/Caddyfile
unit_marker='# Managed by Apex Goods deploy-linux.sh'
site_begin='# BEGIN Apex Goods site (deploy-linux.sh)'
site_end='# END Apex Goods site (deploy-linux.sh)'

for command in node npm sudo systemctl caddy curl flock ss; do
    command -v "$command" >/dev/null || fail "Install $command before deploying."
done

node_bin=$(command -v node)
safe_path='^/[[:alnum:]_./+-]+$'
[[ $app_dir =~ $safe_path && $node_bin =~ $safe_path ]] || fail 'Use project and Node paths without spaces or special characters, such as /opt/ecommerce_website and /usr/bin/node.'
[[ -f $env_file && ! -L $env_file && -O $env_file ]] || fail 'Create a regular .env file owned by your deployment account.'

# Read the same dotenv configuration as the service, without executing it as shell code.
settings=$(env -i PATH="$PATH" "$node_bin" --no-warnings - "${1:-}" <<'NODE'
try {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 13)) throw new Error('Node.js 22.13 or newer is required.');
    require('node:sqlite');
    const path = require('node:path');
    const { appOrigin, trustProxy } = require('./src/config');
    if (process.env.NODE_ENV !== 'production' || process.env.HOST !== '127.0.0.1' || !trustProxy) {
        throw new Error('Set NODE_ENV=production, HOST=127.0.0.1 and TRUST_PROXY=true in .env.');
    }

    const origin = appOrigin && new URL(appOrigin);
    const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    if (!origin || origin.port || !domainPattern.test(origin.hostname)) {
        throw new Error('Set APP_ORIGIN to a public HTTPS domain without a custom port.');
    }
    const redirect = process.argv[2].toLowerCase();
    if (redirect && (!domainPattern.test(redirect) || redirect === origin.hostname)) {
        throw new Error('The redirect domain must be a different DNS hostname from APP_ORIGIN.');
    }

    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error('Set PORT to an unprivileged TCP port between 1024 and 65535.');
    }
    const dbPath = path.resolve(process.env.DB_PATH || 'data/ecommerce.db');
    if (!dbPath.startsWith('/var/lib/apex-goods/')) {
        throw new Error('Set DB_PATH to a database under /var/lib/apex-goods. Keep the current database when updating.');
    }
    console.log(origin.hostname, port, redirect);
} catch (error) {
    console.error(error.code === 'ERR_INVALID_URL' ? 'Invalid APP_ORIGIN in .env.' : error.message);
    process.exitCode = 1;
}
NODE
) || fail 'Fix the production settings before deploying.'
read -r domain port redirect_domain <<< "$settings"

sudo -v
[[ -f $caddy_file && ! -L $caddy_file ]] || fail "Install the standard Caddy systemd service with $caddy_file."
exec 9< /etc/caddy
flock -n 9 || fail 'A deployment is already updating Caddy on this server.'
caddy_user=$(systemctl show caddy.service --property=User --value) || fail 'Caddy systemd service is unavailable.'
[[ -n $caddy_user && $caddy_user != root ]] || fail 'Install the standard Caddy systemd service that runs as the caddy user.'

loaded_unit=$(systemctl show "$service" --property=FragmentPath --value || true)
[[ -z $loaded_unit || $loaded_unit == "$unit_file" ]] || fail "$service is already defined at $loaded_unit."
[[ ! -L $unit_file ]] || fail "$unit_file is a symlink. Review the existing service before continuing."
if sudo test -e "$unit_file"; then
    sudo grep -Fxq -- "User=$app_user" "$unit_file" &&
        sudo grep -Fxq -- "WorkingDirectory=$app_dir" "$unit_file" ||
        fail "$unit_file belongs to another deployment. Review it before continuing."
fi

work=$(mktemp -d)
caddy_stage=''
unit_stage=''
cleanup() {
    [[ -z $caddy_stage ]] || sudo rm -f -- "$caddy_stage"
    [[ -z $unit_stage ]] || sudo rm -f -- "$unit_stage"
    rm -f -- "$work/Caddyfile" "$work/$service"
    rmdir -- "$work"
}
trap cleanup EXIT

# Preserve unrelated sites and global options. Validate beside Caddyfile so relative imports resolve.
sudo cat -- "$caddy_file" | awk -v begin="$site_begin" -v end="$site_end" '
    $0 == begin { if (seen++) exit 1; inside = 1; next }
    $0 == end { if (!inside) exit 1; inside = 0; next }
    !inside { print }
    END { if (inside) exit 1 }
' > "$work/Caddyfile" || fail 'Could not read the managed Caddy block. Check its begin and end markers.'
{
    printf '%s\n' "$site_begin"
    if [[ -n $redirect_domain ]]; then
        printf '%s {\n\tredir https://%s{uri} permanent\n}\n\n' "$redirect_domain" "$domain"
    fi
    cat <<EOF
$domain {
    reverse_proxy 127.0.0.1:$port {
        header_up X-Real-IP {client_ip}
    }
}
$site_end
EOF
} >> "$work/Caddyfile"

caddy_stage=$(sudo mktemp /etc/caddy/.Caddyfile.apex-goods.XXXXXX)
sudo cp -p -- "$caddy_file" "$caddy_stage"
sudo tee "$caddy_stage" < "$work/Caddyfile" > /dev/null
sudo -u "$caddy_user" caddy validate --adapter caddyfile --config "$caddy_stage" ||
    fail "Caddy validation failed. Check for an existing site block for $domain or its redirect domain."

if ! id "$app_user" >/dev/null 2>&1; then
    sudo useradd --system --user-group --home-dir /var/lib/apex-goods --shell /usr/sbin/nologin "$app_user"
fi
getent group "$app_user" >/dev/null && [[ $(id -u "$app_user") != 0 ]] || fail 'The apex-goods service user and group must be unprivileged.'
sudo chgrp -- "$app_user" "$env_file"
chmod 640 -- "$env_file"
sudo -u "$app_user" test -r "$app_dir/src/server.js" || fail "The $app_user user needs read and directory traversal access to $app_dir."
sudo -u "$app_user" "$node_bin" --version >/dev/null || fail 'Install Node.js in a path accessible to the service user.'

printf 'Installing production dependencies in %s\n' "$app_dir"
npm ci --omit=dev --ignore-scripts

cat > "$work/$service" <<EOF
$unit_marker
[Unit]
Description=Apex Goods website
After=network.target

[Service]
Type=exec
User=$app_user
Group=$app_user
WorkingDirectory=$app_dir
ExecStart=$node_bin $app_dir/src/server.js
Environment=NODE_ENV=production HOST=127.0.0.1 TRUST_PROXY=true
Restart=on-failure
RestartSec=3s
StateDirectory=apex-goods
StateDirectoryMode=0700
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
EOF

# A previous unit at the same path can be restored by the server operator.
if ! sudo cmp -s -- "$work/$service" "$unit_file"; then
    if sudo test -f "$unit_file"; then
        unit_backup=$(sudo mktemp /etc/systemd/system/.apex-goods.service.backup.XXXXXX)
        sudo cp -p -- "$unit_file" "$unit_backup"
        printf 'Previous systemd unit saved to %s\n' "$unit_backup"
    fi
    unit_stage=$(sudo mktemp /etc/systemd/system/.apex-goods.service.XXXXXX)
    sudo install -m 644 -- "$work/$service" "$unit_stage"
    sudo mv -fT -- "$unit_stage" "$unit_file"
    unit_stage=''
fi

sudo systemctl daemon-reload
sudo systemctl restart "$service" || fail "Startup failed. Run sudo journalctl -u $service -n 50."
healthy=false
for ((attempt = 1; attempt <= 20; attempt++)); do
    main_pid=$(systemctl show "$service" --property=MainPID --value)
    listeners=$(sudo ss -H -ltnp "sport = :$port")
    if [[ $main_pid != 0 && $listeners == *"pid=$main_pid,"* ]] &&
        curl --noproxy '*' --fail --silent --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null; then
        healthy=true
        break
    fi
    sleep 1
done
[[ $healthy == true ]] || fail "Local health check failed. Run sudo journalctl -u $service -n 50."

if ! sudo cmp -s -- "$caddy_stage" "$caddy_file"; then
    caddy_backup=$(sudo mktemp /etc/caddy/.Caddyfile.backup.XXXXXX)
    sudo cp -p -- "$caddy_file" "$caddy_backup"
    sudo mv -fT -- "$caddy_stage" "$caddy_file"
    if ! sudo systemctl reload-or-restart caddy.service; then
        sudo cp -p -- "$caddy_backup" "$caddy_stage"
        sudo mv -fT -- "$caddy_stage" "$caddy_file"
        sudo systemctl reload-or-restart caddy.service || true
        fail 'Caddy failed to apply the new site. The previous Caddyfile was restored. Run sudo journalctl -u caddy -n 50.'
    fi
    printf 'Previous Caddyfile saved to %s\n' "$caddy_backup"
else
    sudo systemctl reload-or-restart caddy.service
fi
sudo systemctl enable "$service" caddy.service

printf 'Local health check passed. Check public HTTPS from another machine:\n'
printf '  curl -fsS https://%s/api/health\n' "$domain"
