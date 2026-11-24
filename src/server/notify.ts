import 'server-only';
import { and, eq, gte, isNull, ne, or, sql } from 'drizzle-orm';
import { plural } from '@/lib/format';
import { db } from './db';
import { album, albumMember, comment, photo, user } from './db/schema';
import { env } from './env';
import { mailEnabled, trySendMail } from './mail';

/**
 * Avisos por mail, agrupados para no llenar la casilla:
 * - fotos nuevas: un solo mail por tanda de subidas de cada persona en cada álbum;
 * - comentarios: a quien subió la foto y a quienes ya comentaron, como mucho uno cada 10 minutos por foto.
 */
const DELAY = () => Math.max(5, Number(process.env.NOTIFY_DELAY_SECONDS ?? 600)) * 1000;

type Pending = { timer: ReturnType<typeof setTimeout>; since: Date };
const g = globalThis as unknown as { __memoriesNotify?: { uploads: Map<string, Pending>; comments: Map<string, number> } };
const state = (g.__memoriesNotify ??= { uploads: new Map(), comments: new Map() });

async function recipients(albumId: string, exclude: string | null) {
  return db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(albumMember)
    .innerJoin(user, eq(user.id, albumMember.userId))
    .where(and(eq(albumMember.albumId, albumId), eq(user.emailNotifications, true), exclude ? ne(user.id, exclude) : undefined));
}

/** Se llama después de cada subida. El mail sale cuando la persona deja de subir por un rato. */
export function notifyUpload(albumId: string, by: { userId?: string | null; guestName?: string | null }) {
  const key = `${albumId}:${by.userId ?? `guest:${by.guestName ?? ''}`}`;
  const prev = state.uploads.get(key);
  if (prev) clearTimeout(prev.timer);
  const since = prev?.since ?? new Date(Date.now() - 60_000);
  const timer = setTimeout(() => {
    state.uploads.delete(key);
    sendUploadDigest(albumId, by, since).catch(err => console.error('[memories] aviso de fotos nuevas:', err));
  }, DELAY());
  timer.unref?.();
  state.uploads.set(key, { timer, since });
}

async function sendUploadDigest(albumId: string, by: { userId?: string | null; guestName?: string | null }, since: Date) {
  if (!(await mailEnabled())) return;
  const [a] = await db.select({ title: album.title, slug: album.slug }).from(album).where(eq(album.id, albumId));
  if (!a) return;
  const who = by.userId ? eq(photo.uploadedBy, by.userId) : and(isNull(photo.uploadedBy), eq(photo.guestName, by.guestName ?? ''));
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(photo)
    .where(and(eq(photo.albumId, albumId), who, eq(photo.status, 'ready'), gte(photo.createdAt, since)));
  if (!n) return;
  const [u] = by.userId ? await db.select({ name: user.name }).from(user).where(eq(user.id, by.userId)) : [];
  const name = u?.name.split(' ')[0] ?? `${by.guestName ?? 'Alguien'} (sin cuenta)`;
  for (const r of await recipients(albumId, by.userId ?? null)) {
    await trySendMail({
      to: r.email,
      subject: `${name} subió ${plural(n, 'foto', 'fotos')} a ${a.title}`,
      title: `${plural(n, 'foto nueva', 'fotos nuevas')} en ${a.title}`,
      lines: [`${name} subió ${plural(n, 'foto', 'fotos')} al álbum. Ya están reveladas.`],
      cta: { label: 'Ver el álbum', url: `${env.APP_URL}/a/${a.slug}` },
      foot: 'Podés dejar de recibir estos avisos desde Tu perfil.',
    });
  }
}

/** Avisa de un comentario nuevo a quien subió la foto y a quienes ya comentaron. */
export async function notifyComment(photoId: string, authorId: string | null, authorName: string, body: string) {
  if (!(await mailEnabled())) return;
  const [p] = await db
    .select({ albumId: photo.albumId, uploadedBy: photo.uploadedBy, slug: album.slug, title: album.title, file: photo.originalName })
    .from(photo)
    .innerJoin(album, eq(album.id, photo.albumId))
    .where(eq(photo.id, photoId));
  if (!p) return;
  const people = await db
    .selectDistinct({ id: user.id, email: user.email })
    .from(user)
    .innerJoin(albumMember, and(eq(albumMember.userId, user.id), eq(albumMember.albumId, p.albumId)))
    .leftJoin(comment, and(eq(comment.photoId, photoId), eq(comment.userId, user.id)))
    .where(and(eq(user.emailNotifications, true), or(eq(user.id, p.uploadedBy ?? ''), sql`${comment.id} is not null`), authorId ? ne(user.id, authorId) : undefined));
  const now = Date.now();
  for (const r of people) {
    const key = `${photoId}:${r.id}`;
    if (now - (state.comments.get(key) ?? 0) < DELAY()) continue;
    state.comments.set(key, now);
    await trySendMail({
      to: r.email,
      subject: `${authorName} comentó una foto de ${p.title}`,
      title: `Comentario nuevo en ${p.title}`,
      lines: [`${authorName} escribió: "${body.length > 280 ? `${body.slice(0, 277)}…` : body}"`],
      cta: { label: 'Ver la foto', url: `${env.APP_URL}/a/${p.slug}?foto=${photoId}` },
      foot: 'Podés dejar de recibir estos avisos desde Tu perfil.',
    });
  }
}
