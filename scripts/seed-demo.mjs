#!/usr/bin/env node
/**
 * Carga los 6 álbumes de ejemplo del prototipo en una instancia que ya está corriendo.
 * Sirve para ver la interfaz con contenido mientras desarrollás.
 *
 *   ./design/prototype/fetch-photos.sh
 *   node scripts/seed-demo.mjs http://localhost:3000 tu@email.com tu-contraseña
 *
 * Las fotos de ejemplo son de Unsplash (ver design/prototype/CREDITS.md). Los textos son inventados.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const [base = 'http://localhost:3000', email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: node scripts/seed-demo.mjs <url> <email> <contraseña>');
  process.exit(1);
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const proto = path.join(root, 'design/prototype');

// Los datos de los álbumes viven en el prototipo: se leen de ahí para no duplicarlos.
const html = await readFile(path.join(proto, 'index.html'), 'utf8');
const rawSrc = html.slice(html.indexOf('const RAW = ['), html.indexOf('const FILE_PREFIX'));
const RAW = new Function(`${rawSrc}; return RAW;`)();

const login = await fetch(`${base}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) {
  console.error('No pude entrar:', login.status, await login.text());
  process.exit(1);
}
const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const api = (url, init = {}) => fetch(`${base}${url}`, { ...init, headers: { cookie, origin: base, ...(init.headers ?? {}) } });

const exifDate = iso => iso.replace(/-/g, ':').replace('T', ' ') + ':00';
const ratio = s => {
  const m = /^f\/([\d.]+) 1\/(\d+) ISO (\d+)$/.exec(s ?? '');
  return m ? { FNumber: `${Math.round(+m[1] * 10)}/10`, ExposureTime: `1/${m[2]}`, ISOSpeedRatings: m[3] } : {};
};

for (const a of [...RAW].reverse()) {
  const res = await api('/api/albums', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: a.title, place: a.place }) });
  const { id, slug } = await res.json();
  console.log(`${a.title} -> /a/${slug}`);
  for (const [pid, , date, caption, , cam, exp] of a.photos) {
    const [make, ...model] = cam.split(' ');
    const jpeg = await sharp(path.join(proto, `photos/${pid}-l.webp`))
      .withExif({ IFD0: { Make: cam.startsWith('iPhone') ? 'Apple' : make, Model: cam.startsWith('iPhone') ? cam : model.join(' ') || cam }, IFD2: { DateTimeOriginal: exifDate(date), ...ratio(exp) } })
      .jpeg({ quality: 88 })
      .toBuffer();
    const up = await api(`/api/albums/${id}/photos`, {
      method: 'POST',
      body: jpeg,
      headers: { 'content-type': 'image/jpeg', 'x-file-name': encodeURIComponent(`IMG_${pid}.JPG`), 'x-last-modified': String(Date.parse(date)) },
    });
    const { photo } = await up.json();
    await api(`/api/photos/${photo.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: caption }) });
  }
}
console.log('Listo. Las fotos se terminan de revelar en unos segundos.');
