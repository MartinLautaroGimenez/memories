import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { albumRole, canUpload, canView } from '@/server/access';
import { db } from '@/server/db';
import { face, photo } from '@/server/db/schema';
import { facesChanged, suggestFor } from '@/server/faces';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { newId } from '@/server/ids';
import { findOrCreatePerson, peopleNames, photoFaces } from '@/server/people';

export const dynamic = 'force-dynamic';

async function guard(req: Request, photoId: string) {
  const u = await sessionUser(req);
  if (!u) return { error: fail(401, 'Tu sesión venció. Volvé a entrar.') };
  const [p] = await db.select({ albumId: photo.albumId }).from(photo).where(eq(photo.id, photoId));
  const role = p ? await albumRole(p.albumId, u.id) : null;
  if (!p || !canView(role)) return { error: fail(404, 'Esa foto ya no está.') };
  return { user: u, role };
}

/** Quién aparece en la foto, y los nombres conocidos para autocompletar. */
export async function GET(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const g = await guard(req, id);
  if (g.error) return g.error;
  return json({ faces: await photoFaces(id), names: canUpload(g.role) ? await peopleNames(g.user.id) : [] });
}

const Tag = z.union([z.object({ name: z.string().trim().min(1).max(80) }), z.object({ personId: z.string().min(1).max(40) })]);

/** Etiqueta a mano a alguien que aparece (por ejemplo, de espaldas o muy chiquito). */
export async function POST(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const g = await guard(req, id);
  if (g.error) return g.error;
  if (!canUpload(g.role)) return fail(403, 'Solo quienes suben fotos a este álbum pueden decir quién aparece.');
  const body = await readJson(req, Tag);
  if (!body) return fail(400, 'Escribí un nombre.');
  const names = await peopleNames(g.user.id);
  if ('personId' in body && !names.some(n => n.id === body.personId)) return fail(404, 'No conocemos a esa persona.');
  const personId = 'personId' in body ? body.personId : await findOrCreatePerson(g.user.id, body.name);
  const faces = await photoFaces(id);
  if (!faces.some(f => f.person?.id === personId)) {
    await db.insert(face).values({ id: newId(), photoId: id, personId, source: 'manual', confirmed: true });
    facesChanged();
    await suggestFor(personId);
  }
  return json({ faces: await photoFaces(id), names: await peopleNames(g.user.id) });
}
