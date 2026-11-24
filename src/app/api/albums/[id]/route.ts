import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { albumRole, canManage } from '@/server/access';
import { findAlbumById } from '@/server/albums';
import { db } from '@/server/db';
import { album, photo } from '@/server/db/schema';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { removeAlbumFiles } from '@/server/storage';

const Patch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  place: z.string().trim().max(160).optional(),
});

export async function PATCH(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!canManage(await albumRole(id, u.id))) return fail(403, 'Solo quien administra el álbum puede cambiarlo.');
  const body = await readJson(req, Patch);
  if (!body) return fail(400, 'Revisá el nombre del álbum.');
  await db.update(album).set({ ...body, updatedAt: new Date() }).where(eq(album.id, id));
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!canManage(await albumRole(id, u.id))) return fail(403, 'Solo quien administra el álbum puede borrarlo.');
  const a = await findAlbumById(id);
  if (!a) return fail(404, 'Ese álbum ya no existe.');
  const ids = (await db.select({ id: photo.id }).from(photo).where(eq(photo.albumId, id))).map(r => r.id);
  await db.delete(album).where(eq(album.id, id));
  await removeAlbumFiles(id, ids);
  return json({ ok: true });
}
