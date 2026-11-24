import 'server-only';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { ShareSettingsDTO } from '@/lib/types';
import { db } from './db';
import { albumMember, invite, shareLink, type MemberRole } from './db/schema';
import { env } from './env';
import { newId, newToken } from './ids';

const INVITE_DAYS = 14;

export const linkUrl = (token: string) => `${env.APP_URL}/s/${token}`;
export const inviteUrl = (token: string) => `${env.APP_URL}/invite/${token}`;

async function currentLink(albumId: string) {
  const [l] = await db
    .select()
    .from(shareLink)
    .where(and(eq(shareLink.albumId, albumId), isNull(shareLink.revokedAt)))
    .orderBy(desc(shareLink.createdAt))
    .limit(1);
  return l ?? null;
}

async function currentInvite(albumId: string) {
  const [i] = await db
    .select()
    .from(invite)
    .where(and(eq(invite.albumId, albumId), isNull(invite.revokedAt), gt(invite.expiresAt, new Date())))
    .orderBy(desc(invite.createdAt))
    .limit(1);
  return i ?? null;
}

export async function getShareSettings(albumId: string): Promise<ShareSettingsDTO> {
  const [l, i] = await Promise.all([currentLink(albumId), currentInvite(albumId)]);
  return {
    link: l ? { url: linkUrl(l.token), hasPassword: !!l.passwordHash, allowDownload: l.allowDownload } : null,
    invite: i ? { url: inviteUrl(i.token), expiresAt: i.expiresAt.toISOString() } : null,
  };
}

/**
 * Prende, apaga o ajusta el link público.
 * `password`: string = poner o cambiar, null = sacar, undefined = dejar como está.
 */
export async function updateLink(
  albumId: string,
  userId: string,
  opts: { enabled: boolean; password?: string | null; allowDownload?: boolean },
) {
  const existing = await currentLink(albumId);
  if (!opts.enabled) {
    if (existing) await db.update(shareLink).set({ revokedAt: new Date() }).where(eq(shareLink.id, existing.id));
    return;
  }
  const passwordHash = opts.password === undefined ? existing?.passwordHash ?? null : opts.password === null ? null : await hashPassword(opts.password);
  if (existing) {
    await db
      .update(shareLink)
      .set({ passwordHash, allowDownload: opts.allowDownload ?? existing.allowDownload })
      .where(eq(shareLink.id, existing.id));
  } else {
    await db.insert(shareLink).values({
      id: newId(),
      albumId,
      token: newToken(),
      passwordHash,
      allowDownload: opts.allowDownload ?? true,
      createdBy: userId,
    });
  }
}

export const checkLinkPassword = (hash: string, password: string) => verifyPassword({ hash, password });

/** Devuelve la invitación vigente o crea una nueva. */
export async function ensureInvite(albumId: string, userId: string, renew = false) {
  const existing = await currentInvite(albumId);
  if (existing && !renew) return existing;
  if (existing) await db.update(invite).set({ revokedAt: new Date() }).where(eq(invite.id, existing.id));
  const [row] = await db
    .insert(invite)
    .values({
      id: newId(),
      albumId,
      token: newToken(),
      role: 'contributor',
      createdBy: userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000),
    })
    .returning();
  return row;
}

export async function findInvite(token: string) {
  if (!token || token.length > 64) return null;
  const [i] = await db
    .select()
    .from(invite)
    .where(and(eq(invite.token, token), isNull(invite.revokedAt), gt(invite.expiresAt, new Date())));
  return i ?? null;
}

/** Suma a la persona al álbum. Si ya era miembro, no le baja el rol. */
export async function acceptInvite(inv: typeof invite.$inferSelect, userId: string) {
  await db
    .insert(albumMember)
    .values({ albumId: inv.albumId, userId, role: inv.role })
    .onConflictDoNothing();
  await db.update(invite).set({ uses: sql`${invite.uses} + 1` }).where(eq(invite.id, inv.id));
}

export async function setMemberRole(albumId: string, userId: string, role: MemberRole) {
  await db.update(albumMember).set({ role }).where(and(eq(albumMember.albumId, albumId), eq(albumMember.userId, userId)));
}

export async function removeMember(albumId: string, userId: string) {
  await db.delete(albumMember).where(and(eq(albumMember.albumId, albumId), eq(albumMember.userId, userId)));
}

export async function ownerCount(albumId: string) {
  const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from album_member where album_id = ${albumId} and role = 'owner'`);
  return r.rows[0]?.n ?? 0;
}
