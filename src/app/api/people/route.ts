import { z } from 'zod';
import { editableFace, nameFaces } from '@/server/faces/api';
import { fail, json, readJson, sessionUser } from '@/server/http';
import { peopleNames } from '@/server/people';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  return json({ names: await peopleNames(u.id) });
}

const Body = z.object({ name: z.string().trim().min(1).max(80), faceIds: z.array(z.string().min(1).max(40)).min(1).max(500) });

/** "¿Quién es?": le pone nombre a un grupo de caras parecidas. */
export async function POST(req: Request) {
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const body = await readJson(req, Body);
  if (!body) return fail(400, 'Escribí un nombre.');
  const ok: string[] = [];
  for (const id of body.faceIds) if (!(await editableFace(u.id, id)).error) ok.push(id);
  if (!ok.length) return fail(403, 'Solo quienes suben fotos a esos álbumes pueden decir quién aparece.');
  const personId = await nameFaces(u.id, ok, { name: body.name });
  return json({ personId, named: ok.length });
}
