#!/usr/bin/env bash
# BuildCorp: actualizar HTTPS para la IPv4 publica definitiva.
set -Eeuo pipefail
if [ "$#" -ne 1 ]; then echo 'Uso: bash scripts/configurar_https_ip.sh NUEVA_IP' >&2; exit 2; fi
IP="$1"
SITE='/etc/nginx/sites-available/buildcorp'
WEBROOT='/var/www/buildcorp-acme'
CERTBOT='/snap/bin/certbot'
PROJECT="$HOME/BuildCorp"
ENVFILE="$PROJECT/.env"
python3 -c 'import ipaddress,sys; a=ipaddress.ip_address(sys.argv[1]); assert a.version==4 and a.is_global' "$IP" || { echo 'IP publica no valida'; exit 2; }
[ -f "$SITE" ] && [ -f "$ENVFILE" ] || { echo 'Falta el archivo Nginx o .env'; exit 1; }
sudo nginx -t
if [ ! -x "$CERTBOT" ]; then CERTBOT="$(command -v certbot || true)"; fi
[ -n "$CERTBOT" ] && [ -x "$CERTBOT" ] || { echo 'Falta Certbot (>=5.4)'; exit 1; }
"$CERTBOT" --version
read -rp 'Correo para certificado Lets Encrypt: ' EMAIL
case "$EMAIL" in *@*.*) ;; *) echo 'Correo invalido'; exit 2 ;; esac
BACKUP="$(mktemp)"
sudo cp "$SITE" "$BACKUP"
OK=0
cleanup(){
  if [ "$OK" -ne 1 ]; then
    echo 'Restaurando configuracion anterior de Nginx'
    sudo cp "$BACKUP" "$SITE"
    sudo nginx -t && sudo systemctl reload nginx || true
  fi
  rm -f "$BACKUP"
}
trap cleanup EXIT
sudo mkdir -p "$WEBROOT/.well-known/acme-challenge"
sudo tee "$SITE" >/dev/null <<NGINX
server {
    listen 80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ { root $WEBROOT; default_type text/plain; }
    location /static/ { alias /var/www/buildcorp/static/; }
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX
sudo nginx -t && sudo systemctl reload nginx
sudo "$CERTBOT" certonly --non-interactive --agree-tos --email "$EMAIL" --preferred-profile shortlived --webroot -w "$WEBROOT" --ip-address "$IP"
LIVE="/etc/letsencrypt/live/$IP"
sudo test -f "$LIVE/fullchain.pem" && sudo test -f "$LIVE/privkey.pem" || { echo 'No se obtuvo certificado'; exit 1; }
sudo tee "$SITE" >/dev/null <<NGINX
server {
    listen 80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ { root $WEBROOT; default_type text/plain; }
    location / { return 301 https://$IP\$request_uri; }
}
server {
    listen 443 ssl default_server;
    server_name $IP;
    ssl_certificate $LIVE/fullchain.pem;
    ssl_certificate_key $LIVE/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location /static/ { alias /var/www/buildcorp/static/; }
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
sudo nginx -t && sudo systemctl reload nginx
export BUILDCORP_IP="$IP"
cd "$PROJECT"
.venv/bin/python - <<'PY'
from pathlib import Path
import os
ip = os.environ['BUILDCORP_IP']
p = Path('.env')
keys = ('DJANGO_ALLOWED_HOSTS=', 'DJANGO_CSRF_TRUSTED_ORIGINS=', 'DJANGO_HTTPS=')
lines = [s for s in p.read_text().splitlines() if not s.startswith(keys)]
lines += [f'DJANGO_ALLOWED_HOSTS={ip},127.0.0.1,localhost', f'DJANGO_CSRF_TRUSTED_ORIGINS=https://{ip}', 'DJANGO_HTTPS=True']
p.write_text('\n'.join(lines)+'\n')
PY
chmod 600 "$ENVFILE"
sudo systemctl restart buildcorp
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
OK=1
sudo systemctl is-active buildcorp nginx
sudo ss -ltnp | grep ':443' || true
curl -fsSI --connect-timeout 5 --resolve "$IP:443:127.0.0.1" "https://$IP/" | head -n 8 || true
echo "Abre https://$IP/"