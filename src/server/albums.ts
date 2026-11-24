import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { avatarColor } from '@/lib/people';
import { fmtCoords } from '@/lib/format';
import type { AlbumCardDTO, AlbumDTO, PersonDTO, PhotoDTO, Role } from '@/lib/types';
import { db } from './db';
import { album, albumMember, favorite, photo, user } from './db/schema';
import { getSettings } from './settings';

type PhotoRow = typeof photo.$inferSelect;

export function toPhotoDTO(p: PhotoRow, uploader?: { id: string; name: string } | null, extra: { fav?: boolean; gps?: boolean } = {}): PhotoDTO {
  return {
    id: p.id,
    status: p.status,
    w: p.width,
    h: p.height,
    color: p.color,
    thumbhash: p.thumbhash,
    takenAt: p.takenAt ? p.takenAt.toISOString() : null,
    note: p.note,
    camera: p.camera,
    exposure: p.exposure ?? null,
    file: p.originalName,
    by: uploader ?? null,
    error: p.status === 'failed' ? p.error : null,
    place: p.place,
    exifTakenAt: p.exifTakenAt ? p.exifTakenAt.toISOString() : null,
    guestName: p.guestName,
    fav: extra.fav ?? false,
    lat: extra.gps === false ? null : p.lat,
    lng: extra.gps === false ? null : p.lng,
  };
}

async function peopleFor(albumIds: string[]): Promise<Map<string, PersonDTO[]>> {
  const map = new Map<string, PersonDTO[]>();
  if (!albumIds.length) return map;
  const rows = await db
    .select({ albumId: albumMember.albumId, role: albumMember.role, id: user.id, name: user.name, joined: albumMember.createdAt })
    .from(albumMember)
    .innerJoin(user, eq(user.id, albumMember.userId))
    .where(inArray(albumMember.albumId, albumIds))
    .orderBy(asc(albumMember.createdAt));
  for (const r of rows) {
    const list = map.get(r.albumId) ?? [];
    list.push({ id: r.id, name: r.name, role: r.role as Role, color: avatarColor(r.id) });
    map.set(r.albumId, list);
  }
  return map;
}

/** Álbumes de la mesa de una persona, del más reciente al más viejo, con 3 copias para la pila. */
export async function listAlbumCards(userId: string): Promise<AlbumCardDTO[]> {
  const rows = await db.execute<{
    id: string; slug: string; title: string; place: string; cover_photo_id: string | null;
    count: number; from: Date | null; to: Date | null; created_at: Date;
  }>(sql`
    select a.id, a.slug, a.title, a.place, a.cover_photo_id, a.created_at,
      count(p.id) filter (where p.status = 'ready')::int as count,
      min(p.taken_at) filter (where p.status = 'ready') as "from",
      max(p.taken_at) filter (where p.status = 'ready') as "to"
    from album a
    join album_member m on m.album_id = a.id and m.user_id = ${userId}
    left join photo p on p.album_id = a.id
    group by a.id
    order by coalesce(max(p.taken_at), a.created_at) desc, a.created_at desc
  `);
  const albums = rows.rows;
  const ids = albums.map(a => a.id);
  if (!ids.length) return [];

  const previews = await db.execute<PhotoRow & { rn: number }>(sql`
    select * from (
      select p.*, row_number() over (
        partition by p.album_id
        order by (p.id = a.cover_photo_id) desc, p.taken_at asc nulls last, p.created_at asc
      ) as rn
      from photo p join album a on a.id = p.album_id
      where p.album_id in ${ids} and p.status = 'ready'
    ) x where rn <= 3
  `);
  const byAlbum = new Map<string, PhotoDTO[]>();
  for (const r of previews.rows) {
    const p = rawPhoto(r as unknown as Record<string, unknown>);
    const list = byAlbum.get(p.albumId) ?? [];
    list.push(toPhotoDTO(p));
    byAlbum.set(p.albumId, list);
  }
  const people = await peopleFor(ids);

  return albums.map(a => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    place: a.place,
    count: a.count,
    from: a.from ? new Date(a.from).toISOString() : null,
    to: a.to ? new Date(a.to).toISOString() : null,
    people: people.get(a.id) ?? [],
    preview: byAlbum.get(a.id) ?? [],
  }));
}

/** Convierte una fila cruda (snake_case) de `photo` al formato de Drizzle. */
function rawPhoto(r: Record<string, unknown>): PhotoRow {
  const date = (v: unknown) => (v ? new Date(v as string) : null);
  return {
    id: r.id as string,
    albumId: r.album_id as string,
    uploadedBy: (r.uploaded_by as string) ?? null,
    originalKey: r.original_key as string,
    originalName: r.original_name as string,
    mime: r.mime as string,
    bytes: r.bytes as number,
    width: (r.width as number) ?? null,
    height: (r.height as number) ?? null,
    takenAt: date(r.taken_at),
    lat: (r.lat as number) ?? null,
    lng: (r.lng as number) ?? null,
    camera: (r.camera as string) ?? null,
    exposure: (r.exposure as PhotoRow['exposure']) ?? null,
    color: (r.color as string) ?? null,
    thumbhash: (r.thumbhash as string) ?? null,
    variants: (r.variants as PhotoRow['variants']) ?? null,
    note: (r.note as string) ?? '',
    status: r.status as PhotoRow['status'],
    attempts: (r.attempts as number) ?? 0,
    error: (r.error as string) ?? null,
    place: (r.place as string) ?? null,
    exifTakenAt: date(r.exif_taken_at),
    rotation: (r.rotation as number) ?? 0,
    sortIndex: (r.sort_index as number) ?? null,
    guestName: (r.guest_name as string) ?? null,
    facesScannedAt: date(r.faces_scanned_at),
    createdAt: date(r.created_at) as Date,
  };
}

export type AlbumRow = typeof album.$inferSelect;

export async function findAlbumBySlug(slug: string): Promise<AlbumRow | null> {
  const [a] = await db.select().from(album).where(eq(album.slug, slug));
  return a ?? null;
}

export async function findAlbumById(id: string): Promise<AlbumRow | null> {
  const [a] = await db.select().from(album).where(eq(album.id, id));
  return a ?? null;
}

/** El álbum completo, listo para la vista. `role` define qué puede hacer quien mira. */
export async function loadAlbum(
  a: AlbumRow,
  role: Role | 'public',
  opts: { includePending?: boolean; userId?: string | null } = {},
): Promise<AlbumDTO> {
  const where = opts.includePending ? eq(photo.albumId, a.id) : and(eq(photo.albumId, a.id), eq(photo.status, 'ready'));
  const order =
    a.sortMode === 'manual'
      ? [sql`${photo.sortIndex} asc nulls last`, sql`${photo.takenAt} asc nulls last`, asc(photo.createdAt)]
      : [sql`${photo.takenAt} asc nulls last`, asc(photo.createdAt)];
  const rows = await db
    .select({ p: photo, uploaderId: user.id, uploaderName: user.name, fav: favorite.userId })
    .from(photo)
    .leftJoin(user, eq(user.id, photo.uploadedBy))
    .leftJoin(favorite, and(eq(favorite.photoId, photo.id), eq(favorite.userId, opts.userId ?? '')))
    .where(where)
    .orderBy(...order);
  const settings = await getSettings();
  const maps = settings.maps && a.showMap;
  const photos = rows.map(r =>
    toPhotoDTO(r.p, r.uploaderId ? { id: r.uploaderId, name: r.uploaderName! } : null, { fav: !!r.fav, gps: maps || role !== 'public' }),
  );
  const dates = rows.filter(r => r.p.status === 'ready' && r.p.takenAt).map(r => +r.p.takenAt!);
  const withGps = rows.find(r => r.p.lat !== null && r.p.lng !== null);
  const lat = a.lat ?? withGps?.p.lat ?? null;
  const lng = a.lng ?? withGps?.p.lng ?? null;
  const people = (await peopleFor([a.id])).get(a.id) ?? [];
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    place: a.place,
    coords: lat !== null && lng !== null && (maps || role !== 'public') ? fmtCoords(lat, lng) : null,
    from: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    to: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    coverPhotoId: a.coverPhotoId,
    role,
    people: role === 'public' ? people.map(p => ({ ...p, id: '' })) : people,
    photos,
    sortMode: a.sortMode === 'manual' ? 'manual' : 'date',
    dayNotes: a.dayNotes ?? {},
    showMap: a.showMap,
    mapsEnabled: settings.maps,
    facesEnabled: settings.faces,
  };
}

export type OnThisDay = { photo: PhotoDTO; album: { slug: string; title: string }; years: number };

/** Una foto tomada estos días en años anteriores, de los álbumes de la persona (prefiere sus favoritas). */
export async function onThisDay(userId: string, today = new Date()): Promise<OnThisDay | null> {
  const r = await db.execute<Record<string, unknown> & { album_slug: string; album_title: string; years: number }>(sql`
    select p.*, a.slug as album_slug, a.title as album_title,
      (extract(year from ${today.toISOString()}::timestamptz) - extract(year from p.taken_at))::int as years
    from photo p
    join album a on a.id = p.album_id
    join album_member m on m.album_id = a.id and m.user_id = ${userId}
    left join favorite f on f.photo_id = p.id and f.user_id = ${userId}
    where p.status = 'ready' and p.taken_at is not null
      and extract(year from p.taken_at) < extract(year from ${today.toISOString()}::timestamptz)
      and abs(extract(doy from p.taken_at) - extract(doy from ${today.toISOString()}::timestamptz)) <= 3
    order by (f.user_id is not null) desc, random()
    limit 1
  `);
  const row = r.rows[0];
  if (!row) return null;
  return { photo: toPhotoDTO(rawPhoto(row)), album: { slug: row.album_slug, title: row.album_title }, years: row.years };
}
