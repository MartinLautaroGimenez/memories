import { albumRole, canUpload, canView } from '@/server/access';
import { fail, sessionUser, type Ctx } from '@/server/http';
import { ingestUpload, photoStatus } from '@/server/photos/ingest';

export const dynamic = 'force-dynamic';

/** Estado de fotos puntuales (para saber cuándo terminaron de revelarse). */
export async function GET(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!canView(await albumRole(id, u.id))) return fail(404, 'No encontramos ese álbum.');
  return photoStatus(id, new URL(req.url).searchParams.get('ids'));
}

/** Sube una foto (ver ingestUpload). */
export async function POST(req: Request, { params }: Ctx<{ id: string }>) {
  const { id: albumId } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!canUpload(await albumRole(albumId, u.id))) return fail(403, 'En este álbum solo podés mirar.');
  return ingestUpload(req, albumId, { user: { id: u.id, name: u.name } });
}
