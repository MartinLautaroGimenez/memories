import { albumRole, canView } from '@/server/access';
import { findAlbumById } from '@/server/albums';
import { fail, sessionUser, type Ctx } from '@/server/http';
import { albumZip } from '@/server/zip';

export const dynamic = 'force-dynamic';

/** Descarga el álbum (o las fotos elegidas con ?ids=a,b,c) en un ZIP con los originales. */
export async function GET(req: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params;
  const u = await sessionUser(req);
  if (!u) return fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (!canView(await albumRole(id, u.id))) return fail(404, 'No encontramos ese álbum.');
  const a = await findAlbumById(id);
  if (!a) return fail(404, 'No encontramos ese álbum.');
  const ids = new URL(req.url).searchParams.get('ids')?.split(',').filter(Boolean).slice(0, 5000);
  return albumZip(a.id, a.title, ids);
}
