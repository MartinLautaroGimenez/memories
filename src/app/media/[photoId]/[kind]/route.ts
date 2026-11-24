import { eq } from 'drizzle-orm';
import { activeLink, albumRole, linkUnlocked } from '@/server/access';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { photo } from '@/server/db/schema';
import { fileInfo, readStream, variantKey } from '@/server/storage';
import type { Ctx } from '@/server/http';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['thumb', 'display', 'original']);

/**
 * Sirve las imágenes. Puede verlas quien es miembro del álbum o quien trae un
 * link público válido (`?s=<token>`), destrabado con contraseña si la tiene.
 */
export async function GET(req: Request, { params }: Ctx<{ photoId: string; kind: string }>) {
  const { photoId, kind } = await params;
  if (!KINDS.has(kind)) return new Response('No encontrado', { status: 404 });
  const [p] = await db.select().from(photo).where(eq(photo.id, photoId));
  if (!p) return new Response('No encontrado', { status: 404 });

  let allowed = false;
  let allowOriginal = false;
  const s = await auth.api.getSession({ headers: req.headers });
  if (s && (await albumRole(p.albumId, s.user.id))) {
    allowed = true;
    allowOriginal = true;
  } else {
    const token = new URL(req.url).searchParams.get('s');
    const link = token ? await activeLink(token) : null;
    if (link && link.albumId === p.albumId && (await linkUnlocked(link))) {
      allowed = true;
      allowOriginal = link.allowDownload;
    }
  }
  if (!allowed || (kind === 'original' && !allowOriginal)) return new Response('No encontrado', { status: 404 });

  if (kind !== 'original' && p.status !== 'ready') return new Response('Todavía se está revelando', { status: 404 });
  const key = kind === 'original' ? p.originalKey : variantKey(p.id, kind as 'thumb' | 'display');
  const info = await fileInfo(key);
  if (!info) return new Response('No encontrado', { status: 404 });

  const etag = `"${p.id}-${kind}-${info.size}"`;
  const headers = new Headers({
    'Content-Type': kind === 'original' ? p.mime : 'image/webp',
    'Content-Length': String(info.size),
    'Cache-Control': 'private, max-age=31536000, immutable',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  });
  if (kind === 'original') {
    const download = new URL(req.url).searchParams.has('download');
    headers.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(p.originalName)}`);
  }
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(readStream(key), { headers });
}
