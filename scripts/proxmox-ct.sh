#!/usr/bin/env bash
# Crea un CT de Proxmox con Memories instalado. Se corre en la consola del host de Proxmox:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/MartinLautaroGimenez/memories/HEAD/scripts/proxmox-ct.sh)"
#
# Se puede ajustar con variables antes del comando, por ejemplo:
#   CT_RAM=4096 CT_DISK=100 CT_IP=192.168.1.50/24 CT_GW=192.168.1.1 bash -c "$(curl ...)"
#
#   CTID          número del CT (por defecto, el siguiente libre)
#   CT_HOSTNAME   nombre (memories)
#   CT_CORES      núcleos (2)
#   CT_RAM        memoria en MB (2048; para compilar conviene no bajar de 2048)
#   CT_SWAP       swap en MB (1024)
#   CT_DISK       disco en GB (32; ahí van también las fotos)
#   CT_STORAGE    almacenamiento del disco (el primero que acepte contenedores)
#   CT_BRIDGE     puente de red (vmbr0)
#   CT_IP         dhcp o una IP fija con máscara, por ejemplo 192.168.1.50/24
#   CT_GW         gateway si usás IP fija
#   CT_VLAN       etiqueta de VLAN (opcional)
#   DEBIAN_VERSION 12 o 13 (12)
#   MEMORIES_URL  dirección pública si ya tenés dominio (https://fotos.tudominio.com)
#   MEMORIES_BRANCH rama a instalar (la principal del repo)
set -euo pipefail

REPO_RAW="${MEMORIES_RAW:-https://raw.githubusercontent.com/MartinLautaroGimenez/memories/${MEMORIES_BRANCH:-HEAD}}"

c_ok=$'\e[32m'; c_info=$'\e[36m'; c_err=$'\e[31m'; c_dim=$'\e[2m'; c_off=$'\e[0m'
step() { printf '%s›%s %s\n' "$c_info" "$c_off" "$*"; }
ok()   { printf '%s✓%s %s\n' "$c_ok" "$c_off" "$*"; }
die()  { printf '%s✗ %s%s\n' "$c_err" "$*" "$c_off" >&2; exit 1; }
trap 'die "Falló en la línea $LINENO."' ERR

[ "$(id -u)" -eq 0 ] || die "Corré este script como root en el host de Proxmox."
command -v pct >/dev/null && command -v pveam >/dev/null || die "No encuentro pct: este script se corre en el host de Proxmox, no dentro de un CT. Para instalar en un CT que ya tenés, usá scripts/install.sh."

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
CT_HOSTNAME="${CT_HOSTNAME:-memories}"
CT_CORES="${CT_CORES:-2}"
CT_RAM="${CT_RAM:-2048}"
CT_SWAP="${CT_SWAP:-1024}"
CT_DISK="${CT_DISK:-32}"
CT_BRIDGE="${CT_BRIDGE:-vmbr0}"
CT_IP="${CT_IP:-dhcp}"
DEBIAN_VERSION="${DEBIAN_VERSION:-12}"
CT_STORAGE="${CT_STORAGE:-$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')}"
TPL_STORAGE="${TPL_STORAGE:-$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')}"
[ -n "$CT_STORAGE" ] || die "No encontré un almacenamiento para contenedores. Indicalo con CT_STORAGE=local-lvm"
[ -n "$TPL_STORAGE" ] || die "No encontré dónde guardar plantillas. Indicalo con TPL_STORAGE=local"
pct status "$CTID" >/dev/null 2>&1 && die "Ya existe un CT con el número $CTID. Elegí otro con CTID=..."

echo
printf '%smemories%s  CT de Proxmox\n\n' "$c_ok" "$c_off"
printf '%s  CT %s "%s": %s núcleos, %s MB de RAM, %s GB en %s, red %s (%s)%s\n\n' \
  "$c_dim" "$CTID" "$CT_HOSTNAME" "$CT_CORES" "$CT_RAM" "$CT_DISK" "$CT_STORAGE" "$CT_BRIDGE" "$CT_IP" "$c_off"

# 1. Plantilla de Debian
step "Buscando la plantilla de Debian $DEBIAN_VERSION"
pveam update >/dev/null 2>&1 || true
TEMPLATE=$(pveam available --section system | awk -v v="debian-${DEBIAN_VERSION}-standard" '$2 ~ v {print $2}' | sort -V | tail -1)
[ -n "$TEMPLATE" ] || die "No encontré la plantilla debian-${DEBIAN_VERSION}-standard. Probá con DEBIAN_VERSION=12."
if ! pveam list "$TPL_STORAGE" | grep -q "$TEMPLATE"; then
  step "Descargando $TEMPLATE"
  pveam download "$TPL_STORAGE" "$TEMPLATE" >/dev/null
fi
ok "Plantilla $TEMPLATE"

# 2. Crear el CT (sin privilegios, con nesting para que systemd ande bien)
step "Creando el CT $CTID"
NET="name=eth0,bridge=$CT_BRIDGE,ip=$CT_IP${CT_GW:+,gw=$CT_GW}${CT_VLAN:+,tag=$CT_VLAN}"
pct create "$CTID" "$TPL_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$CT_HOSTNAME" \
  --cores "$CT_CORES" \
  --memory "$CT_RAM" \
  --swap "$CT_SWAP" \
  --rootfs "$CT_STORAGE:$CT_DISK" \
  --net0 "$NET" \
  --ostype debian \
  --unprivileged 1 \
  --features nesting=1 \
  --onboot 1 \
  --tags memories \
  --description "Memories: tus fotos de viajes y eventos. https://github.com/MartinLautaroGimenez/memories" >/dev/null
pct start "$CTID"
ok "CT $CTID creado y encendido"

# 3. Esperar la red
step "Esperando la red"
IP=""
for _ in $(seq 1 60); do
  IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}') || true
  if [ -n "$IP" ] && pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then break; fi
  sleep 2
done
[ -n "$IP" ] || die "El CT no consiguió IP. Revisá el puente ($CT_BRIDGE) o usá CT_IP=... y CT_GW=..."
ok "IP $IP"

# 4. Instalar Memories adentro
pct exec "$CTID" -- bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates >/dev/null"
pct exec "$CTID" -- env \
  MEMORIES_URL="${MEMORIES_URL:-}" \
  MEMORIES_BRANCH="${MEMORIES_BRANCH:-}" \
  MEMORIES_PORT="${MEMORIES_PORT:-3000}" \
  bash -c "curl -fsSL '$REPO_RAW/scripts/install.sh' -o /root/memories-install.sh && bash /root/memories-install.sh"

echo
printf '%s  Entrar al CT:   pct enter %s\n' "$c_dim" "$CTID"
printf '  Actualizar:     pct exec %s -- memories-update%s\n\n' "$CTID" "$c_off"
