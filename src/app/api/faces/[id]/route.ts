import { z } from 'zod';
import { editableFace, hideFace, nameFaces, rejectFace } from '@/server/faces/api';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { peopleNames, photoFaces } from '@/server/people';

export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({ name: z.string().trim().min(1).max(80) }),
  z.object({ personId: z.string().min(1).max(40) }),
  z.object({ confirm: z.literal(true) }),
  z.object({ reject: z.literal(true) }),
  z.object({ hide: z.literal(true) }),
]);

/** Nombrar, confirmar, descartar u ocultar una cara. Devuelve cómo quedan las caras de la foto. */
export async function PATCH(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const e = await editableFace(u.id, id);
  if (e.error) return e.error;
  const body = await readJson(req, Body);
  if (!body) return fail(400, 'No entendimos el cambio.');
  if ('name' in body) await nameFaces(u.id, [id], { name: body.name });
  else if ('personId' in body) {
    if (!(await peopleNames(u.id)).some(n => n.id === body.personId)) return fail(404, 'No conocemos a esa persona.');
    await nameFaces(u.id, [id], { personId: body.personId });
  } else if ('confirm' in body) {
    if (!e.face.personId) return fail(400, 'Esa cara todavía no tiene nombre.');
    await nameFaces(u.id, [id], { personId: e.face.personId });
  } else if ('reject' in body) await rejectFace(id);
  else await hideFace(id, e.face.source === 'manual');
  return json({ faces: await photoFaces(e.face.photoId), names: await peopleNames(u.id) });
}

/** Quitar: una etiqueta a mano se borra; una cara detectada se oculta. */
export async function DELETE(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const e = await editableFace(u.id, id);
  if (e.error) return e.error;
  await hideFace(id, e.face.source === 'manual');
  return json({ faces: await photoFaces(e.face.photoId) });
}
