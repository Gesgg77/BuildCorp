#!/usr/bin/env bash
# Activa HTTPS en una EC2 BuildCorp con IP publica y Let's Encrypt.
# Requiere Ubuntu, sudo, Nginx funcionando en :80 y puertos 80/443 abiertos en AWS.
set -Eeuo pipefail

IP="54.166.123.243"
SITE="/etc/nginx/sites-available/buildcorp"
WEBROOT="/var/www/buildcorp-acme"
CERTBOT="/snap/bin/certbot"

if [[ ! -f "$SITE" ]]; then
  echo "ERROR: no existe $SITE. No se hicieron cambios." >&2
  exit 1
fi
if [[ ! -f "$HOME/BuildCorp/.env" ]]; then
  echo "ERROR: falta ~/BuildCorp/.env." >&2
  exit 1
fi

echo "Preparando Certbot (Let's Encrypt) ..."
if ! command -v snap >/dev/null; then
  sudo apt-get update
  sudo apt-get install -y snapd
fi
if [[ ! -x "$CERTBOT" ]]; then
  sudo snap install --classic certbot
fi
"$CERTBOT" --version

read -rp "Correo para avisos de certificado: " EMAIL
if [[ "$EMAIL" != *"@"* ]]; then
  echo "Correo inválido; no se cambió Nginx." >&2
  exit 1
fi

sudo mkdir -p "$WEBROOT/.well-known/acme-challenge"
BACKUP="$(mktemp)"
ENVFILE="$HOME/BuildCorp/.env"
ENV_BACKUP="$(mktemp)"
sudo cp "$SITE" "$BACKUP"
cp "$ENVFILE" "$ENV_BACKUP"
COMPLETE=0
restore() {
  if [[ "$COMPLETE" -ne 1 ]]; then
    echo "Restaurando Nginx anterior..."
    sudo cp "$BACKUP" "$SITE"
    cp "$ENV_BACKUP" "$ENVFILE"
    chmod 600 "$ENVFILE"
    sudo nginx -t && sudo systemctl reload nginx || true
  fi
  rm -f "$BACKUP" "$ENV_BACKUP"
}
trap restore EXIT

sudo tee "$SITE" >/dev/null <<NGINX
server {
    listen 80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ {
        root $WEBROOT;
        default_type text/plain;
    }
    location /static/ { alias $HOME/BuildCorp/staticfiles/; }
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }
}
NGINX
sudo nginx -t
sudo systemctl reload nginx

echo "Solicitando certificado IP a Let's Encrypt..."
sudo "$CERTBOT" certonly --non-interactive --agree-tos \
  --email "$EMAIL" --preferred-profile shortlived \
  --webroot -w "$WEBROOT" --ip-address "$IP"

LIVE="/etc/letsencrypt/live/$IP"
if [[ ! -f "$LIVE/fullchain.pem" || ! -f "$LIVE/privkey.pem" ]]; then
  echo "ERROR: Certbot no generó los archivos esperados." >&2
  exit 1
fi

sudo tee "$SITE" >/dev/null <<NGINX
server {
    listen 80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ {
        root $WEBROOT;
        default_type text/plain;
    }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl default_server;
    server_name $IP;
    ssl_certificate $LIVE/fullchain.pem;
    ssl_certificate_key $LIVE/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /static/ { alias $HOME/BuildCorp/staticfiles/; }
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }
}
NGINX
sudo nginx -t
sudo systemctl reload nginx

cd "$HOME/BuildCorp"
.venv/bin/python - <<'PY'
from pathlib import Path
p = Path(".env")
lines = [
    x for x in p.read_text().splitlines()
    if not x.startswith(("DJANGO_HTTPS=", "DJANGO_CSRF_TRUSTED_ORIGINS="))
]
lines.extend([
    "DJANGO_HTTPS=True",
    "DJANGO_CSRF_TRUSTED_ORIGINS=https://54.166.123.243"
])
p.write_text("\n".join(lines) + "\n")
PY
chmod 600 .env

sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
sudo systemctl restart buildcorp
COMPLETE=1
echo "HTTPS configurado. Abre https://$IP/ y comprueba la regla 443 en AWS Security Group."
echo "Certificados IP Let\x27s Encrypt: duración 6 días, renovación automática requerida."
