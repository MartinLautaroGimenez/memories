import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { albumRole, canManage, canUpload, canView } from '@/server/access';
import { toPhotoDTO } from '@/server/albums';
import { db } from '@/server/db';
import { album, favorite, photo, user } from '@/server/db/schema';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { rotateFaces } from '@/server/faces';
import { enqueue } from '@/server/photos/queue';
import { removePhotoFiles } from '@/server/storage';

/** "2026-06-15T16:05" -> Date con esa hora de reloj (las fechas de las fotos se guardan como UTC). */
const WallClock = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
  .transform(v => new Date(`${v.length === 16 ? `${v}:00` : v}Z`))
  .refine(d => !isNaN(+d) && d.getUTCFullYear() > 1900 && d.getUTCFullYear() < 2200, 'Fecha inválida');

const Patch = z.object({
  note: z.string().max(600).optional(),
  cover: z.literal(true).optional(),
  fav: z.boolean().optional(),
  takenAt: WallClock.optional(),
  resetDate: z.literal(true).optional(),
  place: z.string().trim().max(160).nullable().optional(),
  camera: z.string().trim().max(120).nullable().optional(),
  rotate: z.union([z.literal(90), z.literal(-90), z.literal(180)]).optional(),
});

async function load(id: string) {
  const [p] = await db.select().from(photo).where(eq(photo.id, id));
  return p ?? null;
}

export async function PATCH(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const p = await load(id);
  if (!p) return fail(404, 'Esa foto ya no está.');
  const role = await albumRole(p.albumId, u.id);
  if (!canView(role)) return fail(404, 'Esa foto ya no está.');
  const body = await readJson(req, Patch);
  if (!body) return fail(400, 'Revisá los datos: la nota tiene hasta 600 caracteres y la fecha tiene que ser válida.');

  // Favorita: cada persona tiene las suyas
  if (body.fav !== undefined) {
    if (body.fav) await db.insert(favorite).values({ photoId: id, userId: u.id }).onConflictDoNothing();
    else await db.delete(favorite).where(and(eq(favorite.photoId, id), eq(favorite.userId, u.id)));
  }
  if (body.note !== undefined) {
    if (!canUpload(role)) return fail(403, 'En este álbum solo podés mirar.');
    await db.update(photo).set({ note: body.note }).where(eq(photo.id, id));
  }
  if (body.cover) {
    if (!canManage(role)) return fail(403, 'Solo quien administra el álbum elige la portada.');
    await db.update(album).set({ coverPhotoId: id, updatedAt: new Date() }).where(eq(album.id, p.albumId));
  }

  // Datos de la foto: quien administra el álbum o quien la subió
  const editsData = body.takenAt || body.resetDate || body.place !== undefined || body.camera !== undefined || body.rotate;
  if (editsData) {
    if (!(canManage(role) || (canUpload(role) && p.uploadedBy === u.id))) return fail(403, 'Solo podés editar las fotos que subiste vos.');
    const set: Partial<typeof photo.$inferInsert> = {};
    if (body.takenAt) set.takenAt = body.takenAt;
    if (body.resetDate && p.exifTakenAt) set.takenAt = p.exifTakenAt;
    if (body.place !== undefined) set.place = body.place || null;
    if (body.camera !== undefined) set.camera = body.camera || null;
    if (body.rotate) {
      if (p.status !== 'ready') return fail(409, 'Esperá a que la foto termine de revelarse.');
      Object.assign(set, { rotation: (((p.rotation + body.rotate) % 360) + 360) % 360, status: 'processing', attempts: 0 });
    }
    await db.update(photo).set(set).where(eq(photo.id, id));
    if (body.rotate) {
      await rotateFaces(id, body.rotate);
      enqueue(id);
    }
  }

  const [row] = await db
    .select({ p: photo, uid: user.id, uname: user.name, fav: favorite.userId })
    .from(photo)
    .leftJoin(user, eq(user.id, photo.uploadedBy))
    .leftJoin(favorite, and(eq(favorite.photoId, photo.id), eq(favorite.userId, u.id)))
    .where(eq(photo.id, id));
  return json({ photo: toPhotoDTO(row.p, row.uid ? { id: row.uid, name: row.uname! } : null, { fav: !!row.fav }) });
}

export async function DELETE(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const p = await load(id);
  if (!p) return fail(404, 'Esa foto ya no está.');
  const role = await albumRole(p.albumId, u.id);
  if (!(canManage(role) || (canUpload(role) && p.uploadedBy === u.id))) {
    return fail(403, 'Solo podés borrar las fotos que subiste vos.');
  }
  await db.delete(photo).where(eq(photo.id, id));
  await db.update(album).set({ coverPhotoId: null }).where(eq(album.coverPhotoId, id));
  await removePhotoFiles(p);
  return json({ ok: true });
}

