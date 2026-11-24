#!/usr/bin/env bash
# Descarga las fotos de ejemplo del prototipo (Unsplash vía Lorem Picsum).
# Uso: ./fetch-photos.sh   (desde design/prototype)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p photos
# id:orientación  (L = 3:2 apaisada, P = 4:5 vertical, S = 1:1 cuadrada)
PHOTOS="515:L 509:P 511:L 512:L 510:S 506:P 507:L 514:S
29:L 434:L 447:P 466:P 469:S 177:L 128:L 473:P
419:L 397:P 164:L 234:P 524:L 322:P 402:L 513:S
158:L 452:L 453:P 407:S 195:P 396:L 56:S 223:L
215:L 218:P 372:S 129:L 244:L 390:P 374:L 521:P
183:L 314:P 196:L 261:S 247:L 141:L 379:L 525:P"
size() { case "$1:$2" in
  L:t) echo "720/480";;  L:l) echo "1800/1200";;
  P:t) echo "560/700";;  P:l) echo "1280/1600";;
  S:t) echo "600/600";;  S:l) echo "1400/1400";; esac; }
for p in $PHOTOS; do
  id=${p%%:*}; o=${p##*:}
  [ -s "photos/$id-t.webp" ] || curl -fsSL -o "photos/$id-t.webp" "https://picsum.photos/id/$id/$(size "$o" t).webp" &
  [ -s "photos/$id-l.webp" ] || curl -fsSL -o "photos/$id-l.webp" "https://picsum.photos/id/$id/$(size "$o" l).webp" &
  while [ "$(jobs -r | wc -l)" -ge 12 ]; do wait -n; done
done
wait
echo "Listo: $(ls photos | wc -l) archivos en photos/"
