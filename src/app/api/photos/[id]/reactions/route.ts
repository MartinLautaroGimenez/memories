import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { REACTIONS } from '@/lib/types';
import { albumRole, canView } from '@/server/access';
import { db } from '@/server/db';
import { photo, reaction } from '@/server/db/schema';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';

const Body = z.object({ kind: z.enum(REACTIONS), on: z.boolean() });

/** Pone o saca una reacción de quien mira. Devuelve el total por tipo. */
export async function POST(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const [p] = await db.select({ albumId: photo.albumId }).from(photo).where(eq(photo.id, id));
  if (!p || !canView(await albumRole(p.albumId, u.id))) return fail(404, 'Esa foto ya no está.');
  const body = await readJson(req, Body);
  if (!body) return fail(400, 'Esa reacción no existe.');
  if (body.on) await db.insert(reaction).values({ photoId: id, userId: u.id, kind: body.kind }).onConflictDoNothing();
  else await db.delete(reaction).where(and(eq(reaction.photoId, id), eq(reaction.userId, u.id), eq(reaction.kind, body.kind)));
  const rows = await db
    .select({ kind: reaction.kind, n: sql<number>`count(*)::int`, mine: sql<boolean>`bool_or(${reaction.userId} = ${u.id})` })
    .from(reaction)
    .where(eq(reaction.photoId, id))
    .groupBy(reaction.kind);
  return json({
    reactions: Object.fromEntries(rows.map(r => [r.kind, r.n])),
    myReactions: rows.filter(r => r.mine).map(r => r.kind),
  });
}
