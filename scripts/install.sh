#!/usr/bin/env bash
# Instala o actualiza Memories en Debian o Ubuntu (por ejemplo, dentro de un CT de Proxmox).
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/MartinLautaroGimenez/memories/HEAD/scripts/install.sh)"
#
# Correrlo de nuevo actualiza a la última versión y conserva las fotos, la base y la configuración.
#
# Variables opcionales:
#   MEMORIES_URL     dirección pública, por ejemplo https://fotos.tudominio.com (por defecto http://<IP>:<puerto>)
#   MEMORIES_PORT    puerto (por defecto 3000)
#   MEMORIES_BRANCH  rama de git (por defecto la principal del repo)
#   MEMORIES_REPO    repositorio (por defecto el oficial)
set -euo pipefail

REPO="${MEMORIES_REPO:-https://github.com/MartinLautaroGimenez/memories.git}"
BRANCH="${MEMORIES_BRANCH:-}"
PORT="${MEMORIES_PORT:-3000}"
APP_DIR=/opt/memories
DATA_DIR=/var/lib/memories
ENV_DIR=/etc/memories
ENV_FILE="$ENV_DIR/memories.env"
SERVICE=memories
NODE_MAJOR=22

c_ok=$'\e[32m'; c_info=$'\e[36m'; c_err=$'\e[31m'; c_dim=$'\e[2m'; c_off=$'\e[0m'
step() { printf '%s›%s %s\n' "$c_info" "$c_off" "$*"; }
ok()   { printf '%s✓%s %s\n' "$c_ok" "$c_off" "$*"; }
die()  { printf '%s✗ %s%s\n' "$c_err" "$*" "$c_off" >&2; exit 1; }
trap 'die "Falló en la línea $LINENO. Revisá el mensaje de arriba y volvé a correr el comando: retoma desde donde quedó."' ERR
# El repo es del usuario memories y git se corre como root: se marca como confiable.
git_app() { git -c safe.directory="$APP_DIR" -C "$APP_DIR" "$@"; }

[ "$(id -u)" -eq 0 ] || die "Corré este script como root."
command -v apt-get >/dev/null || die "Este instalador es para Debian o Ubuntu."
export DEBIAN_FRONTEND=noninteractive DEBCONF_NOWARNINGS=yes

echo
printf '%smemories%s  instalador\n\n' "$c_ok" "$c_off"

mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 1800 ]; then
  printf '%s! Hay %s MB de RAM. Para compilar conviene tener 2 GB (después alcanza con mucho menos).%s\n' "$c_err" "$mem_mb" "$c_off"
fi

# 1. Paquetes del sistema
step "Instalando paquetes del sistema"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg openssl postgresql >/dev/null
ok "Paquetes listos"

# 2. Node.js
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  step "Instalando Node.js $NODE_MAJOR"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
fi
corepack enable >/dev/null 2>&1 || npm install -g corepack >/dev/null
ok "Node.js $(node -v)"

# 3. Usuario y carpetas
if ! id memories >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin memories
fi
install -d -o memories -g memories -m 0750 "$DATA_DIR" "$DATA_DIR/photos"
install -d -o root -g memories -m 0750 "$ENV_DIR"

# 4. Base de datos
step "Preparando PostgreSQL"
systemctl enable --now postgresql >/dev/null 2>&1 || service postgresql start
for _ in $(seq 1 30); do runuser -u postgres -- pg_isready -q && break; sleep 1; done
if [ -f "$ENV_FILE" ]; then
  DB_PASS=$(sed -n 's#^DATABASE_URL=postgres://memories:\([^@]*\)@.*#\1#p' "$ENV_FILE")
fi
DB_PASS="${DB_PASS:-$(openssl rand -hex 24)}"
runuser -u postgres -- psql -qtAc "select 1 from pg_roles where rolname='memories'" | grep -q 1 \
  || runuser -u postgres -- psql -qc "create role memories login password '$DB_PASS'"
runuser -u postgres -- psql -qc "alter role memories password '$DB_PASS'"
runuser -u postgres -- psql -qtAc "select 1 from pg_database where datname='memories'" | grep -q 1 \
  || runuser -u postgres -- createdb -O memories memories
ok "PostgreSQL $(runuser -u postgres -- psql -qtAc 'show server_version' | cut -d' ' -f1)"

# 5. Configuración (se crea una vez y se conserva en las actualizaciones)
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ ! -f "$ENV_FILE" ]; then
  step "Creando la configuración"
  URL="${MEMORIES_URL:-http://${IP:-localhost}:$PORT}"
  cat > "$ENV_FILE" <<EOF
# Configuración de Memories. Después de cambiarla: systemctl restart $SERVICE
APP_URL=${URL%/}
# Otras direcciones desde las que se entra, separadas por coma
TRUSTED_ORIGINS=http://${IP:-localhost}:$PORT
DATABASE_URL=postgres://memories:$DB_PASS@127.0.0.1:5432/memories
AUTH_SECRET=$(openssl rand -base64 32)
STORAGE_PATH=$DATA_DIR/photos
MAX_UPLOAD_MB=200
PROCESS_CONCURRENCY=2
PORT=$PORT
HOSTNAME=0.0.0.0
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOF
  chown root:memories "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  ok "Configuración en $ENV_FILE"
else
  ok "Se conserva la configuración de $ENV_FILE"
fi

# 6. Código
step "Descargando Memories"
if [ -d "$APP_DIR/.git" ]; then
  git_app remote set-url origin "$REPO"
  git_app fetch -q --depth 1 origin "${BRANCH:-HEAD}"
  git_app reset -q --hard FETCH_HEAD
  git_app clean -qfd -e .next -e node_modules
else
  rm -rf "$APP_DIR"
  git clone -q --depth 1 ${BRANCH:+--branch "$BRANCH"} "$REPO" "$APP_DIR"
fi
chown -R memories:memories "$APP_DIR"
REV=$(git_app rev-parse --short HEAD)
ok "Versión $REV"

# 7. Compilación (como el usuario memories, sin privilegios)
step "Instalando dependencias y compilando (tarda unos minutos)"
as_app() {
  runuser -u memories -- env HOME="$DATA_DIR" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1 \
    PATH="$PATH" bash -c "cd '$APP_DIR' && $*"
}
as_app "pnpm install --frozen-lockfile --reporter=silent"
as_app "pnpm build > '$DATA_DIR/build.log' 2>&1" || { tail -30 "$DATA_DIR/build.log"; die "La compilación falló. El log completo está en $DATA_DIR/build.log"; }
as_app "cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && cp -r drizzle .next/standalone/drizzle"
ok "Compilado"

# 8. Servicio
step "Configurando el servicio"
cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=Memories
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=memories
Group=memories
WorkingDirectory=$APP_DIR/.next/standalone
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 \
  || { journalctl -u "$SERVICE" -n 30 --no-pager || true; die "Memories no arrancó. Mirá el log con: journalctl -u $SERVICE -e"; }
ok "Memories está corriendo"

URL=$(sed -n 's/^APP_URL=//p' "$ENV_FILE")
echo
printf '  Abrí %s%s%s y creá la primera cuenta.\n\n' "$c_ok" "$URL" "$c_off"
printf '%s  Fotos:          %s/photos\n' "$c_dim" "$DATA_DIR"
printf '  Configuración:  %s\n' "$ENV_FILE"
printf '  Logs:           journalctl -u %s -f\n' "$SERVICE"
printf '  Actualizar:     volvé a correr este mismo comando%s\n\n' "$c_off"
