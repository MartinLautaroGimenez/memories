// Genera los SVG de la marca Memories a partir de wordmark.json
// (curvas de "memories" en Archivo wdth 125 / wght 800, ver wordmark.py).
// Uso: node brand/src/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..');
const W = JSON.parse(readFileSync(join(here, 'wordmark.json'), 'utf8'));

const C = {
  ink: '#172024', paper: '#FCFCFA', stamp: '#FF6B12',
  table: '#E9EEF0', tableHot: '#F9FCFD', tableEdge: '#C9D3D8',
  dark: '#170D0B', darkHot: '#5A160F', darkInk: '#F3E7E1', darkPaper: '#EFE9E3',
};

/* Fechador de 7 segmentos (mismo dibujo que la app) */
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
const SEGP = { a: [2.3, 1, 7.7, 1], b: [9, 2.3, 9, 7.7], c: [9, 10.3, 9, 15.7], d: [2.3, 17, 7.7, 17], e: [1, 10.3, 1, 15.7], f: [1, 2.3, 1, 7.7], g: [2.3, 9, 7.7, 9] };
function stampPath(text) {
  let x = 0, d = '';
  for (const ch of text) {
    if (ch === ' ') { x += 9; continue; }
    if (ch === "'") { d += `M${x + 2.4} 1L${x + 1.5} 4.8`; x += 5.5; continue; }
    for (const k of SEGS[ch] || '') { const [x1, y1, x2, y2] = SEGP[k]; d += `M${(x + x1).toFixed(1)} ${y1}L${(x + x2).toFixed(1)} ${y2}`; }
    x += 13;
  }
  return { d, w: x - 3 };
}

/* La marca: dos copias apiladas. La de adelante tiene la foto y el fechador. */
function mark({ ink, paper, photo, stamp, gap, solidBack = false, withStamp = true, sw = 3.2 }) {
  const s = stampPath("'26");
  const sh = 5.4, sc = sh / 18; // alto del fechador en unidades de la marca
  return `
  <g transform="rotate(-11 24 26)">
    <rect x="6" y="12" width="36" height="28" rx="2.4" fill="${solidBack ? ink : paper}" stroke="${gap || ink}" stroke-width="${sw}"/>
  </g>
  <g transform="rotate(6 38.5 39)">
    <rect x="19" y="24" width="39" height="30" rx="2.4" fill="${paper}" stroke="${gap || ink}" stroke-width="${sw}"/>
    <rect x="23.4" y="28.4" width="30.2" height="21.2" rx="0.9" fill="${photo}"/>
    ${withStamp ? `<g transform="translate(${(51.4 - s.w * sc).toFixed(2)} 41.6) scale(${sc.toFixed(3)})"><path d="${s.d}" transform="skewX(-7)" fill="none" stroke="${stamp}" stroke-width="2.6" stroke-linecap="round"/></g>` : `<rect x="46.2" y="44.2" width="4.6" height="2.6" rx="1.3" fill="${stamp}"/>`}
  </g>`;
}

/* Wordmark con el punto de la i como LED del fechador */
function wordmark(ink, stamp) {
  const [x0, y0, x1, y1] = W.dotBounds[0];
  const r = Math.min(x1 - x0, y1 - y0);
  return `<path d="${W.ink}" fill="${ink}"/>
  <rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" rx="${(r * .18).toFixed(1)}" fill="${stamp}"/>`;
}

function svg(w, h, body, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${extra}>${body}\n</svg>\n`;
}

mkdirSync(out, { recursive: true });
const files = {};

// Marca suelta (fondo transparente)
const light = { ink: C.ink, paper: C.paper, photo: C.ink, stamp: C.stamp };
const dark = { ink: C.darkInk, paper: C.darkPaper, photo: C.dark, stamp: C.stamp, gap: C.dark };
files['memories-mark.svg'] = svg(64, 64, mark(light), ' role="img" aria-label="Memories"');
files['memories-mark-dark.svg'] = svg(64, 64, mark(dark), ' role="img" aria-label="Memories"');

// Logo horizontal: marca + wordmark
// Altura x del wordmark = 31 unidades; la línea de base queda a la altura del borde inferior de la copia de adelante
const markSize = 64, scale = 31 / W.xHeight;
const wmW = W.width * scale, gapX = 12, H = 64;
const wmY = 52;
function lockup(m, ink) {
  return `${mark(m)}
  <g transform="translate(${markSize + gapX} ${wmY}) scale(${scale.toFixed(5)})">${wordmark(ink, C.stamp)}</g>`;
}
const LW = Math.ceil(markSize + gapX + wmW + 2);
files['memories-logo.svg'] = svg(LW, H, lockup(light, C.ink), ' role="img" aria-label="Memories"');
files['memories-logo-dark.svg'] = svg(LW, H, lockup(dark, C.darkInk), ' role="img" aria-label="Memories"');

// Solo el wordmark
const ws = 1, WH = Math.ceil(W.ascender * 1.0);
files['memories-wordmark.svg'] = svg(Math.ceil(W.width), 780, `<g transform="translate(0 740)">${wordmark(C.ink, C.stamp)}</g>`, ' role="img" aria-label="memories"');

// Favicon: versión simplificada, trazos más gruesos, sin dígitos
files['favicon.svg'] = svg(64, 64, `
  <style>
    .k{stroke:${C.ink}} .p{fill:${C.paper}} .f{fill:${C.ink}}
    @media (prefers-color-scheme: dark){ .k{stroke:${C.dark}} .p{fill:${C.darkPaper}} .f{fill:${C.dark}} }
  </style>
  <g transform="rotate(-11 24 26)"><rect class="p k" x="5" y="11" width="37" height="29" rx="3" stroke-width="5"/></g>
  <g transform="rotate(6 38.5 39)">
    <rect class="p k" x="18" y="23" width="41" height="32" rx="3" stroke-width="5"/>
    <rect class="f" x="23.5" y="28.5" width="30" height="21" rx="1"/>
    <rect x="44" y="43" width="7" height="3.6" rx="1.8" fill="${C.stamp}"/>
  </g>`);

// Ícono de app: mesa de luz con dos copias con sombra real
function appIcon(theme) {
  const isDark = theme === 'dark';
  const bg = isDark
    ? `<radialGradient id="bg" cx="50%" cy="-5%" r="95%"><stop offset="0" stop-color="${C.darkHot}"/><stop offset=".75" stop-color="${C.dark}"/></radialGradient>`
    : `<radialGradient id="bg" cx="50%" cy="10%" r="95%"><stop offset="0" stop-color="${C.tableHot}"/><stop offset=".55" stop-color="${C.table}"/><stop offset="1" stop-color="${C.tableEdge}"/></radialGradient>`;
  const grid = isDark ? '' : `<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${C.ink}" stroke-opacity=".05" stroke-width="2"/></pattern>`;
  const shadow = isDark ? '0.7' : '0.28';
  const paper = isDark ? C.darkPaper : C.paper;
  const s = stampPath("'26");
  const sc = 0.95;
  return svg(1024, 1024, `
  <defs>${bg}${grid}
    <linearGradient id="photo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A3A44"/><stop offset=".62" stop-color="#1A262D"/><stop offset="1" stop-color="#111A1F"/></linearGradient>
    <filter id="sh" x="-50%" y="-50%" width="200%" height="220%">
      <feDropShadow dx="0" dy=".45" stdDeviation=".4" flood-color="#0B1418" flood-opacity="${(+shadow * 0.9).toFixed(2)}"/>
      <feDropShadow dx="0" dy="2.6" stdDeviation="2.4" flood-color="#0B1418" flood-opacity="${shadow}"/>
    </filter>
    <filter id="glow" x="-50%" y="-80%" width="200%" height="260%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${grid ? '<rect width="1024" height="1024" fill="url(#grid)"/>' : ''}
  <g transform="translate(512 520) scale(11.2) translate(-32 -33)">
    <g filter="url(#sh)" transform="rotate(-11 24 26)"><rect x="6" y="12" width="36" height="28" rx=".8" fill="${paper}"/></g>
    <g filter="url(#sh)" transform="rotate(6 38.5 39)">
      <rect x="19" y="24" width="39" height="30" rx=".8" fill="${paper}"/>
      <rect x="21.4" y="26.4" width="34.2" height="25.2" fill="url(#photo)"/>
    </g>
    <g transform="rotate(6 38.5 39)">
      <g filter="url(#glow)" transform="translate(${(52.6 - s.w * sc * 0.3).toFixed(2)} 45.2) scale(${(sc * 0.3).toFixed(3)})"><path d="${s.d}" transform="skewX(-7)" fill="none" stroke="${C.stamp}" stroke-width="2.4" stroke-linecap="round"/></g>
    </g>
  </g>`);
}
files['app-icon.svg'] = appIcon('light');
files['app-icon-dark.svg'] = appIcon('dark');

for (const [name, content] of Object.entries(files)) writeFileSync(join(out, name), content);

// Logo para la app: los colores salen de variables CSS para seguir el tema.
const themed = { ink: 'var(--logo-line)', paper: 'var(--logo-paper)', photo: 'var(--logo-photo)', stamp: 'var(--stamp)' };
const inner = lockup(themed, 'var(--ink)')
  .replace(/fill="(var\([^)]+\))"/g, 'style="fill:$1"')
  .replace(/stroke="(var\([^)]+\))"/g, 'style="stroke:$1"')
  .replace(/style="fill:([^"]+)" style="stroke:([^"]+)"/g, 'style="fill:$1;stroke:$2"')
  .replace(/\s+/g, ' ')
  .trim();
const ts = `// Generado por brand/src/build.mjs. No editar a mano.\nexport const LOGO_VIEWBOX = '0 0 ${LW} ${H}';\nexport const LOGO_MARKUP = ${JSON.stringify(inner)};\n`;
writeFileSync(join(here, '..', '..', 'src', 'components', 'logo-markup.ts'), ts);
console.log('Escritos:', Object.keys(files).join(', '));
