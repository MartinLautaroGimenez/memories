import 'server-only';
import { statfs } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { auth } from './auth';
import { db } from './db';
import { album, albumMember, photo, user } from './db/schema';
import { env } from './env';
import { removeAlbumFiles } from './storage';

export type AdminUser = {
  id: string; name: string; email: string; role: string; createdAt: string;
  albums: number; photos: number; bytes: number;
};

export async function listUsers(): Promise<AdminUser[]> {
  const r = await db.execute<{ id: string; name: string; email: string; role: string; created_at: Date; albums: number; photos: number; bytes: string | null }>(sql`
    select u.id, u.name, u.email, u.role, u.created_at,
      (select count(*) from album_member m where m.user_id = u.id)::int as albums,
      (select count(*) from photo p where p.uploaded_by = u.id)::int as photos,
      (select sum(p.bytes + coalesce((p.variants->'thumb'->>'bytes')::bigint, 0) + coalesce((p.variants->'display'->>'bytes')::bigint, 0))
         from photo p where p.uploaded_by = u.id) as bytes
    from "user" u order by u.created_at asc
  `);
  return r.rows.map(x => ({
    id: x.id, name: x.name, email: x.email, role: x.role, createdAt: new Date(x.created_at).toISOString(),
    albums: x.albums, photos: x.photos, bytes: Number(x.bytes ?? 0),
  }));
}

export type StorageStats = {
  originals: number; variants: number; photos: number; albums: number;
  disk: { free: number; total: number } | null;
  top: { title: string; slug: string; bytes: number; photos: number }[];
};

export async function storageStats(): Promise<StorageStats> {
  const [t] = (await db.execute<{ originals: string | null; variants: string | null; photos: number; albums: number }>(sql`
    select sum(bytes) as originals,
      sum(coalesce((variants->'thumb'->>'bytes')::bigint, 0) + coalesce((variants->'display'->>'bytes')::bigint, 0)) as variants,
      count(*)::int as photos, (select count(*) from album)::int as albums
    from photo
  `)).rows;
  const top = await db.execute<{ title: string; slug: string; bytes: string; photos: number }>(sql`
    select a.title, a.slug, coalesce(sum(p.bytes), 0) as bytes, count(p.id)::int as photos
    from album a left join photo p on p.album_id = a.id
    group by a.id order by coalesce(sum(p.bytes), 0) desc limit 8
  `);
  let disk: StorageStats['disk'] = null;
  try {
    const s = await statfs(env.STORAGE_PATH);
    disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {}
  return {
    originals: Number(t?.originals ?? 0),
    variants: Number(t?.variants ?? 0),
    photos: t?.photos ?? 0,
    albums: t?.albums ?? 0,
    disk,
    top: top.rows.map(x => ({ title: x.title, slug: x.slug, bytes: Number(x.bytes), photos: x.photos })),
  };
}

/** Contraseña temporal fácil de dictar: cuatro grupos de letras y números sin ambiguos. */
export function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => abc[randomInt(abc.length)]).join('')).join('-');
}

/** Crea una cuenta sin iniciar sesión como ella. */
export async function createAccount(name: string, email: string, password: string) {
  const ctx = await auth.$context;
  if (await ctx.internalAdapter.findUserByEmail(email)) throw new Error('Ya hay una cuenta con ese email.');
  const created = await ctx.internalAdapter.createUser({ name, email, emailVerified: false }, { method: 'admin' });
  await ctx.internalAdapter.linkAccount({ userId: created.id, providerId: 'credential', accountId: created.id, password: await ctx.password.hash(password) });
  return created;
}

export async function setPassword(userId: string, password: string) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(userId);
}

export async function setRole(userId: string, role: 'admin' | 'member') {
  if (role === 'member') {
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from "user" where role = 'admin' and id <> ${userId}`)).rows;
    if (n === 0) throw new Error('Tiene que quedar al menos una persona que administre.');
  }
  await db.update(user).set({ role }).where(eq(user.id, userId));
}

/**
 * Borra una cuenta. Sus álbumes no quedan huérfanos: si había más personas,
 * la más antigua pasa a administrarlos; si estaba sola, el álbum se borra.
 */
export async function deleteAccount(userId: string) {
  const owned = await db.select({ albumId: albumMember.albumId }).from(albumMember).where(and(eq(albumMember.userId, userId), eq(albumMember.role, 'owner')));
  let removedAlbums = 0;
  for (const { albumId } of owned) {
    const others = await db
      .select({ userId: albumMember.userId, role: albumMember.role })
      .from(albumMember)
      .where(and(eq(albumMember.albumId, albumId), ne(albumMember.userId, userId)))
      .orderBy(albumMember.createdAt);
    if (others.some(o => o.role === 'owner')) continue;
    if (others.length) {
      await db.update(albumMember).set({ role: 'owner' }).where(and(eq(albumMember.albumId, albumId), eq(albumMember.userId, others[0].userId)));
    } else {
      const ids = (await db.select({ id: photo.id }).from(photo).where(eq(photo.albumId, albumId))).map(r => r.id);
      await db.delete(album).where(eq(album.id, albumId));
      await removeAlbumFiles(albumId, ids);
      removedAlbums++;
    }
  }
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUser(userId);
  return { removedAlbums };
}

/** Cuántos álbumes se borrarían junto con la cuenta (para avisar antes). */
export async function soloAlbums(userId: string) {
  const r = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from album_member m
    where m.user_id = ${userId} and m.role = 'owner'
      and not exists (select 1 from album_member o where o.album_id = m.album_id and o.user_id <> ${userId})
  `);
  return r.rows[0]?.n ?? 0;
}
