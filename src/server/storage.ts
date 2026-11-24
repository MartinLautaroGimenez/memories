import 'server-only';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { env } from './env';

/**
 * Storage en disco local. Estructura:
 *   originals/<albumId>/<photoId>.<ext>   el archivo tal cual se subió
 *   variants/<photoId>/<kind>.webp        versiones reducidas (thumb, display)
 */
export function storagePath(key: string): string {
  const root = env.STORAGE_PATH;
  const full = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Ruta de storage inválida');
  return full;
}

export const originalKey = (albumId: string, photoId: string, ext: string) => `originals/${albumId}/${photoId}${ext}`;
export const variantKey = (photoId: string, kind: 'thumb' | 'display') => `variants/${photoId}/${kind}.webp`;

export class TooLargeError extends Error {}

/** Guarda un stream en disco cortando si supera `maxBytes`. Devuelve los bytes escritos. */
export async function saveStream(key: string, body: WebReadableStream<Uint8Array> | ReadableStream<Uint8Array>, maxBytes: number): Promise<number> {
  const file = storagePath(key);
  await mkdir(path.dirname(file), { recursive: true });
  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > maxBytes) cb(new TooLargeError());
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as WebReadableStream<Uint8Array>), limit, createWriteStream(file));
  } catch (err) {
    await unlink(file).catch(() => {});
    throw err;
  }
  return bytes;
}

export async function ensureDir(key: string) {
  await mkdir(path.dirname(storagePath(key)), { recursive: true });
}

export const readBuffer = (key: string) => readFile(storagePath(key));

export async function fileInfo(key: string) {
  try {
    const s = await stat(storagePath(key));
    return { size: s.size, mtime: s.mtime };
  } catch {
    return null;
  }
}

export function readStream(key: string): ReadableStream<Uint8Array> {
  return Readable.toWeb(createReadStream(storagePath(key))) as unknown as ReadableStream<Uint8Array>;
}

export async function removePhotoFiles(p: { id: string; originalKey: string }) {
  await unlink(storagePath(p.originalKey)).catch(() => {});
  await rm(storagePath(`variants/${p.id}`), { recursive: true, force: true });
}

export async function removeAlbumFiles(albumId: string, photoIds: string[]) {
  await rm(storagePath(`originals/${albumId}`), { recursive: true, force: true });
  await Promise.all(photoIds.map(id => rm(storagePath(`variants/${id}`), { recursive: true, force: true })));
}
