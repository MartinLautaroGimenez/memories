import { and, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { albumRole, canManage, canUpload, canView } from '@/server/access';
import { db } from '@/server/db';
import { album, favorite, photo } from '@/server/db/schema';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { removePhotoFiles } from '@/server/storage';

const Scope = z.object({
  ids: z.array(z.string().max(40)).max(5000).optional(),
  by: z.string().max(80).optional(),
  camera: z.string().max(120).optional(),
  all: z.literal(true).optional(),
});

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('shift'), minutes: z.number().int().min(-60 * 24 * 3650).max(60 * 24 * 3650), scope: Scope }),
  z.object({ action: z.literal('reset'), scope: Scope }),
  z.object({ action: z.literal('delete'), scope: Scope }),
  z.object({ action: z.literal('fav'), on: z.boolean(), scope: Scope }),
]);

/**
 * Acciones sobre varias fotos a la vez: corregir la hora, volver a la hora
 * original, borrar o marcar como favoritas.
 */
export async function POST(req: Request, { params }: Ctx<{ id: string }>) {
  const { id: albumId } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const role = await albumRole(albumId, u.id);
  if (!canView(role)) return fail(404, 'No encontramos ese álbum.');
  const body = await readJson(req, Body);
  if (!body) return fail(400, 'No entendimos qué fotos cambiar.');

  const conds: SQL[] = [eq(photo.albumId, albumId)];
  const s = body.scope;
  if (s.ids) conds.push(inArray(photo.id, s.ids.length ? s.ids : ['-']));
  if (s.by) conds.push(s.by.startsWith('guest:') ? eq(photo.guestName, s.by.slice(6)) : eq(photo.uploadedBy, s.by));
  if (s.camera !== undefined) conds.push(s.camera ? eq(photo.camera, s.camera) : sql`${photo.camera} is null`);
  if (!s.ids && !s.by && s.camera === undefined && !s.all) return fail(400, 'Elegí qué fotos cambiar.');

  if (body.action === 'fav') {
    const ids = (await db.select({ id: photo.id }).from(photo).where(and(...conds))).map(r => r.id);
    if (body.on && ids.length) await db.insert(favorite).values(ids.map(photoId => ({ photoId, userId: u.id }))).onConflictDoNothing();
    if (!body.on && ids.length) await db.delete(favorite).where(and(eq(favorite.userId, u.id), inArray(favorite.photoId, ids)));
    return json({ count: ids.length });
  }

  // Lo demás: quien administra toca todo; quien sube, solo lo suyo.
  if (!canUpload(role)) return fail(403, 'En este álbum solo podés mirar.');
  if (!canManage(role)) conds.push(eq(photo.uploadedBy, u.id));

  if (body.action === 'delete') {
    const rows = await db.delete(photo).where(and(...conds)).returning({ id: photo.id, originalKey: photo.originalKey });
    await db.update(album).set({ coverPhotoId: null }).where(and(eq(album.id, albumId), inArray(album.coverPhotoId, rows.length ? rows.map(r => r.id) : ['-'])));
    await Promise.all(rows.map(r => removePhotoFiles(r)));
    return json({ count: rows.length, ids: rows.map(r => r.id) });
  }

  const set =
    body.action === 'shift'
      ? { takenAt: sql`${photo.takenAt} + make_interval(mins => ${body.minutes})` }
      : { takenAt: sql`${photo.exifTakenAt}` };
  conds.push(isNotNull(body.action === 'shift' ? photo.takenAt : photo.exifTakenAt));
  const rows = await db.update(photo).set(set).where(and(...conds)).returning({ id: photo.id, takenAt: photo.takenAt });
  return json({ count: rows.length, photos: rows.map(r => ({ id: r.id, takenAt: r.takenAt?.toISOString() ?? null })) });
}
