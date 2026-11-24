import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { albumRole } from '@/server/access';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { face, photo } from '@/server/db/schema';
import type { Ctx } from '@/server/http';
import { storagePath, variantKey } from '@/server/storage';

export const dynamic = 'force-dynamic';

/** Recorte cuadrado de una cara (o de la foto, si es una etiqueta a mano). Solo para miembros del álbum. */
export async function GET(req: Request, { params }: Ctx<{ faceId: string }>) {
  const { faceId } = await params;
  const [f] = await db
    .select({ box: face.box, photoId: face.photoId, albumId: photo.albumId, w: photo.width, h: photo.height, status: photo.status })
    .from(face)
    .innerJoin(photo, eq(photo.id, face.photoId))
    .where(eq(face.id, faceId));
  const s = await auth.api.getSession({ headers: req.headers });
  if (!f || f.status !== 'ready' || !s || !(await albumRole(f.albumId, s.user.id))) return new Response('No encontrado', { status: 404 });

  const etag = `"face-${faceId}"`;
  const headers = { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=31536000, immutable', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });

  const src = storagePath(variantKey(f.photoId, f.box ? 'display' : 'thumb'));
  const meta = await sharp(src).metadata().catch(() => null);
  if (!meta?.width || !meta.height) return new Response('No encontrado', { status: 404 });
  const W = meta.width, H = meta.height;
  let region;
  if (f.box) {
    // Un poco más que la cara, para que se vea pelo y mentón
    const cx = (f.box.x + f.box.w / 2) * W, cy = (f.box.y + f.box.h / 2) * H;
    const side = Math.min(W, H, Math.max(f.box.w * W, f.box.h * H) * 1.7);
    const left = Math.round(Math.min(Math.max(0, cx - side / 2), W - side));
    const top = Math.round(Math.min(Math.max(0, cy - side / 2 - side * 0.04), H - side));
    region = { left, top, width: Math.round(side), height: Math.round(side) };
  } else {
    const side = Math.min(W, H);
    region = { left: Math.round((W - side) / 2), top: Math.round((H - side) / 3), width: side, height: side };
  }
  const out = await sharp(src).extract(region).resize(192, 192).webp({ quality: 82 }).toBuffer();
  return new Response(new Uint8Array(out), { headers: { ...headers, 'Content-Length': String(out.length) } });
}
