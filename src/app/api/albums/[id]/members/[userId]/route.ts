import { z } from 'zod';
import { albumRole, canManage } from '@/server/access';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { ownerCount, removeMember, setMemberRole } from '@/server/share';

type P = Ctx<{ id: string; userId: string }>;

const Patch = z.object({ role: z.enum(['owner', 'contributor', 'viewer']) });

export async function PATCH(req: Request, { params }: P) {
  const { id, userId } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!canManage(await albumRole(id, u.id))) return fail(403, 'Solo quien administra el álbum cambia los permisos.');
  const body = await readJson(req, Patch);
  if (!body) return fail(400, 'Ese permiso no existe.');
  const current = await albumRole(id, userId);
  if (!current) return fail(404, 'Esa persona ya no está en el álbum.');
  if (current === 'owner' && body.role !== 'owner' && (await ownerCount(id)) <= 1) {
    return fail(409, 'El álbum necesita al menos una persona que lo administre.');
  }
  await setMemberRole(id, userId, body.role);
  return json({ ok: true });
}

/** Sacar a alguien del álbum (o irse uno mismo). */
export async function DELETE(req: Request, { params }: P) {
  const { id, userId } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  const me = await albumRole(id, u.id);
  if (userId !== u.id && !canManage(me)) return fail(403, 'Solo quien administra el álbum puede sacar personas.');
  const current = await albumRole(id, userId);
  if (!current) return fail(404, 'Esa persona ya no está en el álbum.');
  if (current === 'owner' && (await ownerCount(id)) <= 1) {
    return fail(409, 'El álbum necesita al menos una persona que lo administre.');
  }
  await removeMember(id, userId);
  return json({ ok: true });
}
