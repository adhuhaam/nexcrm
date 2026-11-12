#!/bin/bash
set -euo pipefail

install -d -m 0750 -o root -g caddy /etc/caddy/pki

if [[ ! -f /etc/caddy/pki/lan-ca.key ]]; then
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout /etc/caddy/pki/lan-ca.key \
    -out /etc/caddy/pki/lan-ca.crt \
    -subj "/CN=JACMS office network" \
    -addext "basicConstraints=critical,CA:true" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
  chmod 600 /etc/caddy/pki/lan-ca.key
fi

openssl req -newkey rsa:2048 -nodes \
  -keyout /etc/caddy/pki/lan.key \
  -out /etc/caddy/pki/lan.csr \
  -subj "/CN=192.168.100.10"
cat > /etc/caddy/pki/lan.ext <<'EOF'
subjectAltName=IP:192.168.100.10,DNS:server
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
EOF
openssl x509 -req -in /etc/caddy/pki/lan.csr \
  -CA /etc/caddy/pki/lan-ca.crt -CAkey /etc/caddy/pki/lan-ca.key -CAcreateserial \
  -out /etc/caddy/pki/lan.crt -days 825 -sha256 -extfile /etc/caddy/pki/lan.ext
chown caddy:caddy /etc/caddy/pki/lan.key /etc/caddy/pki/lan.crt
chmod 640 /etc/caddy/pki/lan.key
chmod 644 /etc/caddy/pki/lan.crt
rm -f /etc/caddy/pki/lan.csr /etc/caddy/pki/lan.ext

install -m 0644 /home/server/dev/jacms/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl restart caddy
systemctl is-active caddy

if ! ufw status | grep -q "192.168.100.0/24"; then
  ufw allow from 192.168.100.0/24 to any port 443 proto tcp
fi

install -m 0644 /etc/caddy/pki/lan-ca.crt /usr/local/share/ca-certificates/jacms-lan.crt
update-ca-certificates
install -o server -g server -m 0644 /etc/caddy/pki/lan-ca.crt /home/server/dev/jacms/deploy/lan-root.crt
echo "LAN HTTPS installed"
