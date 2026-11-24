import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { albumRole, canManage, canUpload } from '@/server/access';
import { db } from '@/server/db';
import { album, photo } from '@/server/db/schema';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { removePhotoFiles } from '@/server/storage';

const Patch = z.object({
  note: z.string().max(600).optional(),
  cover: z.literal(true).optional(),
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
  const body = await readJson(req, Patch);
  if (!body) return fail(400, 'La nota es demasiado larga.');

  if (body.note !== undefined) {
    if (!canUpload(role)) return fail(403, 'En este álbum solo podés mirar.');
    await db.update(photo).set({ note: body.note }).where(eq(photo.id, id));
  }
  if (body.cover) {
    if (!canManage(role)) return fail(403, 'Solo quien administra el álbum elige la portada.');
    await db.update(album).set({ coverPhotoId: id, updatedAt: new Date() }).where(eq(album.id, p.albumId));
  }
  return json({ ok: true });
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
