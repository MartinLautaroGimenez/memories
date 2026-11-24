import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { thumbHashToApproximateAspectRatio } from 'thumbhash';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cameraName, isHeic, parseExifDate, renderPhoto } from '@/server/photos/render';

let dir: string;

/** Una "foto" de 3000x2000 con EXIF de cámara, rotada 90° (orientación 6 como en los celulares). */
async function fixture() {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 40, g: 110, b: 160 } } })
    .composite([{ input: Buffer.from('<svg width="3000" height="2000"><rect x="0" y="1200" width="3000" height="800" fill="#2f2a22"/></svg>'), top: 0, left: 0 }])
    .withExif({
      IFD0: { Make: 'FUJIFILM', Model: 'X100V' },
      IFD2: { DateTimeOriginal: '2026:06:15 16:05:07', FNumber: '28/10', ExposureTime: '1/500', ISOSpeedRatings: '160' },
    })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 90 })
    .toBuffer();
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'memories-render-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('renderPhoto', () => {
  it('genera las variantes orientadas y lee el EXIF', async () => {
    const buf = await fixture();
    const r = await renderPhoto(buf, 'image/jpeg', 'DSCF4412.JPG', dir);

    // Orientación 6: la foto queda vertical
    expect(r.width).toBe(2000);
    expect(r.height).toBe(3000);
    expect(r.variants.thumb).toMatchObject({ w: 480, h: 720 });
    expect(r.variants.display).toMatchObject({ w: 1200, h: 1800 });
    const meta = await sharp(await readFile(path.join(dir, 'display.webp'))).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined(); // las variantes no llevan EXIF (ni GPS)

    expect(r.takenAt?.toISOString()).toBe('2026-06-15T16:05:07.000Z');
    expect(r.camera).toBe('Fujifilm X100V');
    expect(r.exposure).toMatchObject({ fNumber: 2.8, exposureTime: 0.002, iso: 160 });
    expect(r.color).toMatch(/^#[0-9a-f]{6}$/);

    const ar = thumbHashToApproximateAspectRatio(Buffer.from(r.thumbhash, 'base64'));
    expect(ar).toBeGreaterThan(0.55);
    expect(ar).toBeLessThan(0.8);
    expect((await stat(path.join(dir, 'thumb.webp'))).size).toBeLessThan(80_000);
  });

  it('rechaza archivos que no son imágenes', async () => {
    await expect(renderPhoto(Buffer.from('hola'), 'image/jpeg', 'roto.jpg', dir)).rejects.toThrow();
  });
});

describe('helpers', () => {
  it('lee fechas EXIF como hora de reloj', () => {
    expect(parseExifDate('2025:07:04 11:00:00')?.toISOString()).toBe('2025-07-04T11:00:00.000Z');
    expect(parseExifDate('0000:00:00 00:00:00')).toBeNull();
    expect(parseExifDate(undefined)).toBeNull();
  });

  it('arma el nombre de la cámara', () => {
    expect(cameraName('Apple', 'iPhone 15 Pro')).toBe('iPhone 15 Pro');
    expect(cameraName('Google', 'Pixel 8')).toBe('Google Pixel 8');
    expect(cameraName('SONY', 'ILCE-6400')).toBe('Sony ILCE-6400');
    expect(cameraName('Canon', 'Canon EOS R6')).toBe('Canon EOS R6');
    expect(cameraName(undefined, undefined)).toBeNull();
  });

  it('detecta HEIC por tipo o extensión', () => {
    expect(isHeic('image/heic')).toBe(true);
    expect(isHeic('application/octet-stream', 'IMG_2041.HEIC')).toBe(true);
    expect(isHeic('image/jpeg', 'foto.jpg')).toBe(false);
  });
});

describe('HEIC de iPhone', () => {
  it('se decodifica con libheif y genera las variantes', async () => {
    const buf = await readFile(path.join(__dirname, '../fixtures/IMG_2041.HEIC'));
    const out = path.join(dir, 'heic');
    const r = await renderPhoto(buf, 'image/heic', 'IMG_2041.HEIC', out);
    expect([r.width, r.height]).toEqual([360, 480]);
    expect(r.variants.thumb).toMatchObject({ w: 360, h: 480 });
    expect((await sharp(path.join(out, 'display.webp')).metadata()).format).toBe('webp');
  });
});
