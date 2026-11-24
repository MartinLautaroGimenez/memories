import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db';
import { face, person } from '@/server/db/schema';
import { facesChanged, suggestFor } from '@/server/faces';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { canSeePerson } from '@/server/people';

export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({ name: z.string().trim().min(1).max(80) }),
  z.object({ mergeInto: z.string().min(1).max(40) }),
  z.object({ cover: z.string().min(1).max(40) }),
]);

/** Cambiar el nombre, elegir el retrato o unir con otra persona ("es la misma"). */
export async function PATCH(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!(await canSeePerson(u.id, id))) return fail(404, 'No conocemos a esa persona.');
  const body = await readJson(req, Body);
  if (!body) return fail(400, 'No entendimos el cambio.');
  if ('name' in body) {
    await db.update(person).set({ name: body.name.replace(/\s+/g, ' ') }).where(eq(person.id, id));
    return json({ id });
  }
  if ('cover' in body) {
    const [f] = await db.select({ personId: face.personId }).from(face).where(eq(face.id, body.cover));
    if (f?.personId !== id) return fail(400, 'Esa cara no es de esta persona.');
    await db.update(person).set({ coverFaceId: body.cover }).where(eq(person.id, id));
    return json({ id });
  }
  if (body.mergeInto === id || !(await canSeePerson(u.id, body.mergeInto))) return fail(404, 'No conocemos a esa persona.');
  await db.transaction(async tx => {
    await tx.update(face).set({ personId: body.mergeInto }).where(eq(face.personId, id));
    await tx.execute(sql`update face set rejected = array_remove(rejected, ${id})`);
    await tx.delete(person).where(eq(person.id, id));
  });
  facesChanged();
  await suggestFor(body.mergeInto);
  return json({ id: body.mergeInto });
}

/** Olvidar a una persona: sus caras quedan sin nombre y las etiquetas a mano se borran. */
export async function DELETE(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!(await canSeePerson(u.id, id))) return fail(404, 'No conocemos a esa persona.');
  await db.transaction(async tx => {
    await tx.execute(sql`delete from face where person_id = ${id} and source = 'manual'`);
    await tx.update(face).set({ personId: null, confirmed: false }).where(eq(face.personId, id));
    await tx.delete(person).where(eq(person.id, id));
  });
  facesChanged();
  return json({ ok: true });
}
