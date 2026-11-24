import { activeLink, linkUnlocked } from '@/server/access';
import { findAlbumById } from '@/server/albums';
import { fail, type Ctx } from '@/server/http';
import { albumZip } from '@/server/zip';

export const dynamic = 'force-dynamic';

/** Descarga desde un link público, si permite descargar originales. */
export async function GET(req: Request, { params }: Ctx<{ token: string }>) {
  const { token } = await params;
  const link = await activeLink(token);
  if (!link || !(await linkUnlocked(link)) || !link.allowDownload) return fail(404, 'Este link no permite descargar.');
  const a = await findAlbumById(link.albumId);
  if (!a) return fail(404, 'Este link ya no está activo.');
  const ids = new URL(req.url).searchParams.get('ids')?.split(',').filter(Boolean).slice(0, 5000);
  return albumZip(a.id, a.title, ids);
}
