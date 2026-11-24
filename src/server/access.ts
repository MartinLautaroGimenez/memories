import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from './db';
import { albumMember, shareLink, type MemberRole } from './db/schema';
import { env } from './env';

export async function albumRole(albumId: string, userId: string | null | undefined): Promise<MemberRole | null> {
  if (!userId) return null;
  const [m] = await db
    .select({ role: albumMember.role })
    .from(albumMember)
    .where(and(eq(albumMember.albumId, albumId), eq(albumMember.userId, userId)));
  return m?.role ?? null;
}

export const canView = (r: MemberRole | null) => r !== null;
export const canUpload = (r: MemberRole | null) => r === 'owner' || r === 'contributor';
export const canManage = (r: MemberRole | null) => r === 'owner';

export type ActiveLink = typeof shareLink.$inferSelect;

/** Devuelve el link público si existe, no fue revocado y no venció. */
export async function activeLink(token: string): Promise<ActiveLink | null> {
  if (!token || token.length > 64) return null;
  const [l] = await db
    .select()
    .from(shareLink)
    .where(and(eq(shareLink.token, token), isNull(shareLink.revokedAt), or(isNull(shareLink.expiresAt), gt(shareLink.expiresAt, new Date()))));
  return l ?? null;
}

/* La contraseña de un link se valida una vez y queda una cookie firmada. */
const cookieName = (linkId: string) => `mshare_${linkId}`;
const sign = (link: ActiveLink) => createHmac('sha256', env.AUTH_SECRET).update(`${link.id}:${link.passwordHash ?? ''}`).digest('base64url');

export async function linkUnlocked(link: ActiveLink): Promise<boolean> {
  if (!link.passwordHash) return true;
  const v = (await cookies()).get(cookieName(link.id))?.value;
  if (!v) return false;
  const a = Buffer.from(v), b = Buffer.from(sign(link));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function unlockLink(link: ActiveLink) {
  (await cookies()).set(cookieName(link.id), sign(link), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_URL.startsWith('https://'),
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}
