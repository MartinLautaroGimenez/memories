import { z } from 'zod';
import { db } from '@/server/db';
import { album, albumMember } from '@/server/db/schema';
import { fail, json, readJson, sessionUser } from '@/server/http';
import { albumSlug, newId } from '@/server/ids';

const Body = z.object({
  title: z.string().trim().min(1).max(120),
  place: z.string().trim().max(160).optional().default(''),
});

export async function POST(req: Request) {
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const body = await readJson(req, Body);
  if (!body) return fail(400, 'El álbum necesita un nombre.');

  const id = newId();
  const slug = albumSlug(body.title);
  await db.transaction(async tx => {
    await tx.insert(album).values({ id, slug, title: body.title, place: body.place, createdBy: u.id });
    await tx.insert(albumMember).values({ albumId: id, userId: u.id, role: 'owner' });
  });
  return json({ id, slug }, 201);
}
