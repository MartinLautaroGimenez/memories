import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { albumRole, canUpload, canView } from '@/server/access';
import { toPhotoDTO } from '@/server/albums';
import { db } from '@/server/db';
import { photo, user } from '@/server/db/schema';
import { env } from '@/server/env';
import { fail, json, sessionUser, type Ctx } from '@/server/http';
import { newId } from '@/server/ids';
import { isHeic } from '@/server/photos/render';
import { notifyUpload } from '@/server/notify';
import { enqueue } from '@/server/photos/queue';
import { originalKey, saveStream, TooLargeError } from '@/server/storage';

export const dynamic = 'force-dynamic';

const EXT = /\.(jpe?g|png|webp|avif|gif|tiff?|heic|heif)$/i;

/** Estado de fotos puntuales (para saber cuándo terminaron de revelarse). */
export async function GET(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!canView(await albumRole(id, u.id))) return fail(404, 'No encontramos ese álbum.');
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 200);
  if (!ids.length) return json({ photos: [] });
  const rows = await db
    .select({ p: photo, uid: user.id, uname: user.name })
    .from(photo)
    .leftJoin(user, eq(user.id, photo.uploadedBy))
    .where(and(eq(photo.albumId, id), inArray(photo.id, ids)));
  return json({ photos: rows.map(r => toPhotoDTO(r.p, r.uid ? { id: r.uid, name: r.uname! } : null)) });
}

/**
 * Sube una foto. El cuerpo es el archivo tal cual (sin multipart) y el nombre va en
 * el header `x-file-name`. Responde enseguida; el procesamiento sigue en segundo plano.
 */
export async function POST(req: Request, { params }: Ctx<{ id: string }>) {
  const { id: albumId } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!canUpload(await albumRole(albumId, u.id))) return fail(403, 'En este álbum solo podés mirar.');
  if (!req.body) return fail(400, 'No llegó ninguna foto.');

  const name = safeName(req.headers.get('x-file-name'));
  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const looksLikeImage = mime.startsWith('image/') || EXT.test(name);
  if (!looksLikeImage) return fail(415, `${name} no es una foto. Probá con JPG, PNG, WebP o HEIC.`);

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > env.MAX_UPLOAD_BYTES) return fail(413, tooBig(name));

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
      uploadedBy: u.id,
      originalKey: key,
      originalName: name,
      mime: isHeic(mime, name) ? 'image/heic' : mime || 'application/octet-stream',
      bytes,
      takenAt: Number.isFinite(lastModified) && lastModified > 0 ? new Date(lastModified) : null,
      status: 'processing',
    })
    .returning();
  enqueue(id);
  notifyUpload(albumId, { userId: u.id });
  return json({ photo: toPhotoDTO(row, { id: u.id, name: u.name }) }, 201);
}

function safeName(raw: string | null): string {
  let name = 'foto.jpg';
  try {
    if (raw) name = decodeURIComponent(raw);
  } catch {}
  return path.basename(name).replace(/[\u0000-\u001f]/g, '').slice(0, 180) || 'foto.jpg';
}

function tooBig(name: string) {
  return `${name} pesa más de ${Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB, el máximo de esta instalación.`;
}
