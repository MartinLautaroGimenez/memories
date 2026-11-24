import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { albumRole, canManage, canView } from '@/server/access';
import { db } from '@/server/db';
import { comment, photo } from '@/server/db/schema';
import { listComments } from '@/server/comments';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { newId } from '@/server/ids';
import { notifyComment } from '@/server/notify';

export const dynamic = 'force-dynamic';

async function guard(req: Request, photoId: string) {
  const u = await sessionUser(req);
  if (!u) return { error: fail(401, 'Tu sesión venció. Volvé a entrar.') };
  const [p] = await db.select({ albumId: photo.albumId }).from(photo).where(eq(photo.id, photoId));
  if (!p) return { error: fail(404, 'Esa foto ya no está.') };
  const role = await albumRole(p.albumId, u.id);
  if (!canView(role)) return { error: fail(404, 'Esa foto ya no está.') };
  return { user: u, role };
}


export async function GET(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const g = await guard(req, id);
  if (g.error) return g.error;
  return json({ comments: await listComments(id, g.user.id, canManage(g.role)) });
}

const Body = z.object({ body: z.string().trim().min(1).max(1000) });

export async function POST(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const g = await guard(req, id);
  if (g.error) return g.error;
  const body = await readJson(req, Body);
  if (!body) return fail(400, 'El comentario tiene que tener entre 1 y 1000 caracteres.');
  await db.insert(comment).values({ id: newId(), photoId: id, userId: g.user.id, body: body.body });
  notifyComment(id, g.user.id, g.user.name.split(' ')[0], body.body).catch(err => console.error('[memories] aviso de comentario:', err));
  return json({ comments: await listComments(id, g.user.id, canManage(g.role)) }, 201);
}
