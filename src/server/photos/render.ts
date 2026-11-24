import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import type { Exposure, Variants } from '../db/schema';

/**
 * Lee una foto, genera sus versiones reducidas y extrae los datos del dorso.
 * No toca la base de datos: así se puede probar con archivos sueltos.
 */
export type RenderResult = {
  width: number;
  height: number;
  takenAt: Date | null;
  lat: number | null;
  lng: number | null;
  camera: string | null;
  exposure: Exposure | null;
  color: string;
  thumbhash: string;
  variants: Variants;
};

export const VARIANTS = {
  thumb: { size: 720, quality: 78 },
  display: { size: 1800, quality: 82 },
} as const;

const HEIC_MIME = /^image\/hei[cf]/i;
const HEIC_EXT = /\.(heic|heif)$/i;

export function isHeic(mime: string, name = '') {
  return HEIC_MIME.test(mime) || HEIC_EXT.test(name);
}

/** "2026:06:15 16:05:07" -> Date en UTC con esa misma hora de reloj */
export function parseExifDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(+v) ? null : v;
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, dd, h, mi, s] = m.map(Number) as unknown as number[];
  if (y < 1900 || mo < 1 || mo > 12) return null;
  const date = new Date(Date.UTC(y, mo - 1, dd, h, mi, s || 0));
  return isNaN(+date) ? null : date;
}

export function cameraName(make?: unknown, model?: unknown): string | null {
  const mk = typeof make === 'string' ? make.trim().replace(/\0/g, '') : '';
  const md = typeof model === 'string' ? model.trim().replace(/\0/g, '') : '';
  if (!mk && !md) return null;
  if (!md) return mk;
  if (!mk || /^apple$/i.test(mk) || md.toLowerCase().startsWith(mk.toLowerCase().split(' ')[0])) return md;
  const brand = mk.replace(/\s+(corporation|corp\.?|imaging|camera|co\.?,? ?ltd\.?)$/i, '').replace(/^NIKON CORPORATION$/i, 'Nikon');
  const pretty = brand.length > 3 && brand === brand.toUpperCase() ? brand[0] + brand.slice(1).toLowerCase() : brand;
  return `${pretty} ${md}`;
}

type Exif = Record<string, unknown>;

async function readExif(buf: Buffer): Promise<{ tags: Exif | null; gps: { latitude: number; longitude: number } | null }> {
  const tags = await exifr
    .parse(buf, { tiff: true, exif: true, gps: false, xmp: false, icc: false, iptc: false, jfif: false, ihdr: false, reviveValues: false, translateValues: false })
    .catch(() => null);
  const gps = await exifr.gps(buf).catch(() => null);
  const ok = gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude) && !(gps.latitude === 0 && gps.longitude === 0);
  return { tags: (tags as Exif) ?? null, gps: ok ? gps : null };
}

async function decodeHeic(buf: Buffer) {
  const { default: decode } = (await import('heic-decode')) as unknown as {
    default: (o: { buffer: Buffer }) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  };
  const img = await decode({ buffer: buf });
  return { width: img.width, height: img.height, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) };
}

/** Crea una fábrica de pipelines de sharp ya orientados correctamente. */
async function source(buf: Buffer, mime: string, name: string) {
  if (isHeic(mime, name)) {
    // sharp no trae HEVC por patentes: se decodifica con libheif (WASM) y ya viene rotada.
    const raw = await decodeHeic(buf);
    return { make: () => sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } }), width: raw.width, height: raw.height };
  }
  const meta = await sharp(buf, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) throw new Error('Imagen sin dimensiones');
  const swap = (meta.orientation ?? 1) >= 5;
  return {
    make: () => sharp(buf, { failOn: 'none' }).rotate(),
    width: swap ? meta.height : meta.width,
    height: swap ? meta.width : meta.height,
  };
}

export async function renderPhoto(buf: Buffer, mime: string, name: string, outDir: string): Promise<RenderResult> {
  const [src, exif] = await Promise.all([source(buf, mime, name), readExif(buf)]);
  await mkdir(outDir, { recursive: true });

  const variants: Variants = {};
  for (const [kind, v] of Object.entries(VARIANTS) as [keyof typeof VARIANTS, (typeof VARIANTS)[keyof typeof VARIANTS]][]) {
    const info = await src
      .make()
      .resize(v.size, v.size, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: v.quality, effort: 4 })
      .toFile(path.join(/*turbopackIgnore: true*/ outDir, `${kind}.webp`));
    variants[kind] = { w: info.width, h: info.height, bytes: info.size };
  }

  const small = await sharp(path.join(/*turbopackIgnore: true*/ outDir, 'thumb.webp'))
    .resize(100, 100, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const hash = rgbaToThumbHash(small.info.width, small.info.height, small.data);
  const { dominant } = await sharp(path.join(/*turbopackIgnore: true*/ outDir, 'thumb.webp')).stats();
  const hex = (n: number) => n.toString(16).padStart(2, '0');

  const t = exif.tags ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const exposure: Exposure = {
    fNumber: num(t.FNumber),
    exposureTime: num(t.ExposureTime),
    iso: num(t.ISO) ?? num(Array.isArray(t.ISOSpeedRatings) ? t.ISOSpeedRatings[0] : t.ISOSpeedRatings),
    focalLength: num(t.FocalLength),
  };
  const hasExposure = Object.values(exposure).some(v => v !== undefined);

  return {
    width: src.width,
    height: src.height,
    takenAt: parseExifDate(t.DateTimeOriginal) ?? parseExifDate(t.CreateDate) ?? null,
    lat: exif.gps?.latitude ?? null,
    lng: exif.gps?.longitude ?? null,
    camera: cameraName(t.Make, t.Model),
    exposure: hasExposure ? JSON.parse(JSON.stringify(exposure)) : null,
    color: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
    thumbhash: Buffer.from(hash).toString('base64'),
    variants,
  };
}
