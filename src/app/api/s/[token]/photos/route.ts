import { activeLink, linkUnlocked } from '@/server/access';
import { fail, type Ctx } from '@/server/http';
import { guestAllowed, ingestUpload, photoStatus } from '@/server/photos/ingest';
import { getSettings } from '@/server/settings';

export const dynamic = 'force-dynamic';

async function guard(token: string) {
  const link = await activeLink(token);
  if (!link || !(await linkUnlocked(link))) return { error: fail(404, 'Este link ya no está activo.') };
  return { link };
}

export async function GET(req: Request, { params }: Ctx<{ token: string }>) {
  const { token } = await params;
  const g = await guard(token);
  if (g.error) return g.error;
  return photoStatus(g.link.albumId, new URL(req.url).searchParams.get('ids'));
}

/** Subida de invitados sin cuenta, si el link lo permite. El nombre va en `x-guest-name`. */
export async function POST(req: Request, { params }: Ctx<{ token: string }>) {
  const { token } = await params;
  const g = await guard(token);
  if (g.error) return g.error;
  if (!g.link.allowUpload || !(await getSettings()).guestUploads) return fail(403, 'Este link es solo para mirar.');
  let guestName = '';
  try {
    guestName = decodeURIComponent(req.headers.get('x-guest-name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  } catch {}
  if (!guestName) return fail(400, 'Contanos tu nombre para saber quién subió cada foto.');
  if (!guestAllowed(token, req)) return fail(429, 'Subiste muchas fotos seguidas. Esperá un rato y seguí.');
  return ingestUpload(req, g.link.albumId, { guestName });
}
