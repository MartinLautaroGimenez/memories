import 'server-only';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { toPhotoDTO } from '../albums';
import { db } from '../db';
import { photo, user } from '../db/schema';
import { env } from '../env';
import { fail, json } from '../http';
import { newId } from '../ids';
import { notifyUpload } from '../notify';
import { originalKey, saveStream, TooLargeError } from '../storage';
import { enqueue } from './queue';
import { isHeic } from './render';

const EXT = /\.(jpe?g|png|webp|avif|gif|tiff?|heic|heif)$/i;

export function safeName(raw: string | null): string {
  let name = 'foto.jpg';
  try {
    if (raw) name = decodeURIComponent(raw);
  } catch {}
  return path.basename(name).replace(/[\u0000-\u001f]/g, '').slice(0, 180) || 'foto.jpg';
}

function tooBig(name: string) {
  return `${name} pesa más de ${Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB, el máximo de esta instalación.`;
}

/**
 * Guarda una foto subida y la manda a revelar. El cuerpo es el archivo tal cual
 * (sin multipart) y el nombre va en `x-file-name`. Lo usan los miembros y los invitados.
 */
export async function ingestUpload(req: Request, albumId: string, by: { user?: { id: string; name: string }; guestName?: string }) {
  if (!req.body) return fail(400, 'No llegó ninguna foto.');
  const name = safeName(req.headers.get('x-file-name'));
  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!(mime.startsWith('image/') || EXT.test(name))) return fail(415, `${name} no es una foto. Probá con JPG, PNG, WebP o HEIC.`);
  if (Number(req.headers.get('content-length') ?? 0) > env.MAX_UPLOAD_BYTES) return fail(413, tooBig(name));

  const id = newId();
  const ext = (path.extname(name).toLowerCase().match(EXT)?.[0] ?? '.jpg').replace('.jpeg', '.jpg');
  const key = originalKey(albumId, id, ext);
  let bytes: number;
  try {
    bytes = await saveStream(key, req.body, env.MAX_UPLOAD_BYTES);
  } catch (err) {
    if (err instanceof TooLargeError) return fail(413, tooBig(name));
    throw err;
  }
  if (bytes === 0) return fail(400, `${name} está vacía.`);

  const lastModified = Number(req.headers.get('x-last-modified'));
  const [row] = await db
    .insert(photo)
    .values({
      id,
      albumId,
      uploadedBy: by.user?.id ?? null,
      guestName: by.user ? null : by.guestName,
      originalKey: key,
      originalName: name,
      mime: isHeic(mime, name) ? 'image/heic' : mime || 'application/octet-stream',
      bytes,
      takenAt: Number.isFinite(lastModified) && lastModified > 0 ? new Date(lastModified) : null,
      status: 'processing',
    })
    .returning();
  enqueue(id);
  notifyUpload(albumId, { userId: by.user?.id, guestName: by.guestName });
  return json({ photo: toPhotoDTO(row, by.user ?? null) }, 201);
}

/** Estado de fotos puntuales de un álbum (para saber cuándo terminaron de revelarse). */
export async function photoStatus(albumId: string, rawIds: string | null) {
  const ids = (rawIds ?? '').split(',').filter(Boolean).slice(0, 200);
  if (!ids.length) return json({ photos: [] });
  const rows = await db
    .select({ p: photo, uid: user.id, uname: user.name })
    .from(photo)
    .leftJoin(user, eq(user.id, photo.uploadedBy))
    .where(and(eq(photo.albumId, albumId), inArray(photo.id, ids)));
  return json({ photos: rows.map(r => toPhotoDTO(r.p, r.uid ? { id: r.uid, name: r.uname! } : null)) });
}

/* Límite simple para subidas de invitados: 400 fotos por hora por link y dirección IP. */
const g = globalThis as unknown as { __memoriesGuestRate?: Map<string, { n: number; since: number }> };
const rate = (g.__memoriesGuestRate ??= new Map());

export function guestAllowed(token: string, req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  const key = `${token}:${ip}`;
  const now = Date.now();
  const r = rate.get(key);
  if (!r || now - r.since > 3600_000) {
    rate.set(key, { n: 1, since: now });
    return true;
  }
  r.n++;
  return r.n <= 400;
}
