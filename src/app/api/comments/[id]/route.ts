import { eq } from 'drizzle-orm';
import { albumRole, canManage } from '@/server/access';
import { db } from '@/server/db';
import { comment, photo } from '@/server/db/schema';
import { fail, json, sessionUser, type Ctx } from '@/server/http';

/** Borra un comentario: quien lo escribió o quien administra el álbum. */
export async function DELETE(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const [c] = await db.select({ userId: comment.userId, albumId: photo.albumId }).from(comment).innerJoin(photo, eq(photo.id, comment.photoId)).where(eq(comment.id, id));
  if (!c) return fail(404, 'Ese comentario ya no está.');
  if (c.userId !== u.id && !canManage(await albumRole(c.albumId, u.id))) return fail(403, 'Solo podés borrar tus comentarios.');
  await db.delete(comment).where(eq(comment.id, id));
  return json({ ok: true });
}
