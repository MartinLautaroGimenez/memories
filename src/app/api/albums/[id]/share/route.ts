import { z } from 'zod';
import { albumRole, canManage } from '@/server/access';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { ensureInvite, getShareSettings, updateLink } from '@/server/share';

export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({
    link: z.object({
      enabled: z.boolean(),
      password: z.string().min(4).max(200).nullable().optional(),
      allowDownload: z.boolean().optional(),
    }),
  }),
  z.object({ invite: z.object({ renew: z.boolean().optional() }) }),
]);

async function guard(req: Request, id: string) {
  const u = await sessionUser(req);
  if (!u) return { error: fail(401, 'Tu sesión venció. Volvé a entrar.') };
  if (!canManage(await albumRole(id, u.id))) return { error: fail(403, 'Solo quien administra el álbum puede compartirlo.') };
  return { user: u };
}

export async function GET(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const g = await guard(req, id);
  if (g.error) return g.error;
  return json(await getShareSettings(id));
}

export async function POST(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const g = await guard(req, id);
  if (g.error) return g.error;
  const body = await readJson(req, Body);
  if (!body) return fail(400, 'La contraseña tiene que tener al menos 4 caracteres.');
  if ('link' in body) await updateLink(id, g.user.id, body.link);
  else await ensureInvite(id, g.user.id, body.invite.renew);
  return json(await getShareSettings(id));
}
