import { z } from 'zod';
import { albumRole, canManage } from '@/server/access';
import { fail, json, readJson, sessionUser, type Ctx } from '@/server/http';
import { findAlbumById } from '@/server/albums';
import { trySendMail } from '@/server/mail';
import { ensureInvite, getShareSettings, inviteUrl, updateLink } from '@/server/share';

export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({
    link: z.object({
      enabled: z.boolean(),
      password: z.string().min(4).max(200).nullable().optional(),
      allowDownload: z.boolean().optional(),
      allowUpload: z.boolean().optional(),
    }),
  }),
  z.object({ invite: z.object({ renew: z.boolean().optional() }) }),
  z.object({ inviteEmail: z.email() }),
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
  if (!body) return fail(400, 'Revisá los datos: la contraseña necesita al menos 4 caracteres y el email tiene que ser válido.');
  if ('link' in body) await updateLink(id, g.user.id, body.link);
  else if ('invite' in body) await ensureInvite(id, g.user.id, body.invite.renew);
  else {
    const inv = await ensureInvite(id, g.user.id);
    const a = await findAlbumById(id);
    const sent = await trySendMail({
      to: body.inviteEmail,
      subject: `${g.user.name.split(' ')[0]} te invitó a ${a?.title ?? 'un álbum'} en Memories`,
      title: `Te invitaron a ${a?.title ?? 'un álbum'}`,
      lines: [`${g.user.name} quiere que veas las fotos de ${a?.title ?? 'este álbum'} y subas las tuyas.`, 'Con el link creás tu cuenta en un minuto.'],
      cta: { label: 'Ver el álbum', url: inviteUrl(inv.token) },
    });
    if (!sent) return fail(502, 'No pudimos mandar el mail. Revisá el correo en Administración o copiá el link de invitación.');
  }
  return json(await getShareSettings(id));
}
