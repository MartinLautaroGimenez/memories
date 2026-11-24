#!/usr/bin/env bash
# Instala o actualiza Memories en Debian o Ubuntu (por ejemplo, dentro de un CT de Proxmox).
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/MartinLautaroGimenez/memories/HEAD/scripts/install.sh)"
#
# Correrlo de nuevo (o usar `memories-update`) actualiza a la última versión y conserva
# las fotos, la base y la configuración.
#
# Variables opcionales (también sirven para cambiar una instalación existente):
#   MEMORIES_URL     dirección con la que se entra, por ejemplo http://fotos.casa.lan (por defecto http://<IP>:<puerto>)
#   MEMORIES_PORT    puerto (por defecto 3000; con 80 no hace falta poner el puerto en el navegador)
#   MEMORIES_BRANCH  rama de git (por defecto la principal del repo)
#   MEMORIES_REPO    repositorio (por defecto el oficial)
set -euo pipefail

REPO="${MEMORIES_REPO:-https://github.com/MartinLautaroGimenez/memories.git}"
BRANCH="${MEMORIES_BRANCH:-}"
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

# 5. Configuración: se crea una vez y se conserva. MEMORIES_URL y MEMORIES_PORT la cambian si se pasan.
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
origin_for() { if [ "$1" = 80 ]; then echo "http://${IP:-localhost}"; else echo "http://${IP:-localhost}:$1"; fi; }
set_env() {
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
if [ ! -f "$ENV_FILE" ]; then
  step "Creando la configuración"
  first_port="${MEMORIES_PORT:-3000}"
  URL="${MEMORIES_URL:-$(origin_for "$first_port")}"
  cat > "$ENV_FILE" <<EOF
# Configuración de Memories. Después de cambiarla: systemctl restart $SERVICE
APP_URL=${URL%/}
# Otras direcciones desde las que se entra, separadas por coma
TRUSTED_ORIGINS=$(origin_for "$first_port")
DATABASE_URL=postgres://memories:$DB_PASS@127.0.0.1:5432/memories
AUTH_SECRET=$(openssl rand -base64 32)
STORAGE_PATH=$DATA_DIR/photos
MAX_UPLOAD_MB=200
PROCESS_CONCURRENCY=2
PORT=$first_port
HOSTNAME=0.0.0.0
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOF
  chown root:memories "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  ok "Configuración en $ENV_FILE"
else
  [ -n "${MEMORIES_PORT:-}" ] && set_env PORT "$MEMORIES_PORT"
  [ -n "${MEMORIES_URL:-}" ] && set_env APP_URL "${MEMORIES_URL%/}"
  ok "Configuración de $ENV_FILE"
fi
PORT=$(sed -n 's/^PORT=//p' "$ENV_FILE")
PORT="${PORT:-3000}"
# Siempre se puede entrar también por la IP del CT
trusted=$(sed -n 's/^TRUSTED_ORIGINS=//p' "$ENV_FILE")
case ",$trusted," in
  *",$(origin_for "$PORT"),"*) ;;
  *) set_env TRUSTED_ORIGINS "${trusted:+$trusted,}$(origin_for "$PORT")" ;;
esac

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

# 7. Compilación (como el usuario memories, sin privilegios). Si la versión no cambió, no se recompila.
as_app() {
  runuser -u memories -- env HOME="$DATA_DIR" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1 \
    PATH="$PATH" bash -c "cd '$APP_DIR' && $*"
}
BUILT_FILE="$DATA_DIR/.compilado"
if [ -f "$APP_DIR/.next/standalone/server.js" ] && [ "$(cat "$BUILT_FILE" 2>/dev/null)" = "$REV" ]; then
  ok "La versión $REV ya estaba compilada"
else
  step "Instalando dependencias y compilando (tarda unos minutos)"
  as_app "pnpm install --frozen-lockfile --reporter=silent"
  as_app "pnpm build > '$DATA_DIR/build.log' 2>&1" || { tail -30 "$DATA_DIR/build.log"; die "La compilación falló. El log completo está en $DATA_DIR/build.log"; }
  as_app "cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && cp -r drizzle .next/standalone/drizzle"
  echo "$REV" > "$BUILT_FILE"
  ok "Compilado"
fi

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
# Permite usar el puerto 80 sin correr como root
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
cat > /usr/local/bin/memories-update <<'EOF'
#!/usr/bin/env bash
# Actualiza Memories con el instalador más reciente. Acepta MEMORIES_URL y MEMORIES_PORT para cambiar la dirección.
set -euo pipefail
exec bash -c "$(curl -fsSL "https://raw.githubusercontent.com/MartinLautaroGimenez/memories/${MEMORIES_BRANCH:-HEAD}/scripts/install.sh")"
EOF
chmod 0755 /usr/local/bin/memories-update
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
printf '  Actualizar:     memories-update%s\n\n' "$c_off"
