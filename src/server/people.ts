import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { FaceDTO, PersonChip } from '@/lib/types';
import { db } from './db';
import { face, person } from './db/schema';
import { CLUSTER } from './faces';
import { cosine, normalize } from './faces/engine';
import { newId } from './ids';

/**
 * Personas: se ven solo a través de las fotos de los álbumes de cada cuenta.
 * Si una persona no aparece en ningún álbum tuyo, para vos no existe.
 */

const visible = (me: string) => sql`ph.album_id in (select album_id from album_member where user_id = ${me})`;

export async function listPeople(me: string): Promise<PersonChip[]> {
  const r = await db.execute<{ id: string; name: string; face: string | null; count: number }>(sql`
    select p.id, p.name,
      (array_agg(f.id order by (f.id = p.cover_face_id) desc, (f.box is not null) desc, f.confirmed desc, f.score desc nulls last))[1] as face,
      count(distinct f.photo_id)::int as count
    from person p
    join face f on f.person_id = p.id and not f.hidden
    join photo ph on ph.id = f.photo_id and ph.status = 'ready'
    where ${visible(me)}
    group by p.id
    order by count desc, p.name
  `);
  return r.rows;
}

/** Para autocompletar: personas que ya aparecen en tus álbumes. */
export async function peopleNames(me: string) {
  return (await listPeople(me)).map(p => ({ id: p.id, name: p.name }));
}

export async function canSeePerson(me: string, id: string) {
  const r = await db.execute(sql`
    select 1 from face f join photo ph on ph.id = f.photo_id
    where f.person_id = ${id} and ${visible(me)} limit 1
  `);
  return r.rows.length > 0;
}

export async function personDetail(me: string, id: string) {
  const [p] = await db.select().from(person).where(eq(person.id, id));
  if (!p || !(await canSeePerson(me, id))) return null;
  const r = await db.execute<{ photoId: string; faceId: string; confirmed: boolean; slug: string; title: string; takenAt: Date | null; w: number | null; h: number | null; thumbhash: string | null; color: string | null; rot: number; hasBox: boolean }>(sql`
    select distinct on (ph.id) ph.id as "photoId", f.id as "faceId", f.confirmed, a.slug, a.title, ph.taken_at as "takenAt",
      ph.width as w, ph.height as h, ph.thumbhash, ph.color, ph.rotation as rot, (f.box is not null) as "hasBox"
    from face f
    join photo ph on ph.id = f.photo_id and ph.status = 'ready'
    join album a on a.id = ph.album_id
    where f.person_id = ${id} and not f.hidden and ${visible(me)}
    order by ph.id, f.confirmed desc
  `);
  const photos = r.rows
    .map(x => ({ ...x, takenAt: x.takenAt ? new Date(x.takenAt).toISOString() : null }))
    .sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? ''));
  const chip = (await listPeople(me)).find(x => x.id === id);
  return { id: p.id, name: p.name, face: chip?.face ?? null, photos, albums: new Set(photos.map(x => x.slug)).size };
}

/**
 * Caras sin nombre agrupadas por parecido, para preguntar "¿quién es?".
 * Solo las de tus álbumes y como mucho las 1500 más nítidas (alcanza para una familia).
 */
export async function unnamedGroups(me: string) {
  const r = await db.execute<{ id: string; embedding: number[] }>(sql`
    select f.id, f.embedding from face f
    join photo ph on ph.id = f.photo_id and ph.status = 'ready'
    where f.person_id is null and not f.hidden and f.embedding is not null and ${visible(me)}
    order by f.score desc nulls last, f.id
    limit 1500
  `);
  const groups: { sum: Float32Array; center: Float32Array; faces: string[] }[] = [];
  for (const f of r.rows) {
    let best: (typeof groups)[number] | null = null;
    let bestSim = CLUSTER;
    for (const gr of groups) {
      const sim = cosine(f.embedding, gr.center);
      if (sim >= bestSim) { bestSim = sim; best = gr; }
    }
    if (best) {
      f.embedding.forEach((v, i) => (best.sum[i] += v));
      best.center = normalize(best.sum);
      best.faces.push(f.id);
    } else {
      const sum = Float32Array.from(f.embedding);
      groups.push({ sum, center: normalize(sum), faces: [f.id] });
    }
  }
  const multi = groups.filter(gr => gr.faces.length > 1).sort((a, b) => b.faces.length - a.faces.length);
  return {
    groups: multi.slice(0, 12).map(gr => ({ faces: gr.faces })),
    loose: r.rows.length - multi.slice(0, 12).reduce((n, gr) => n + gr.faces.length, 0),
  };
}

/** Las caras de una foto, para el dorso. */
export async function photoFaces(photoId: string): Promise<FaceDTO[]> {
  const rows = await db
    .select({ id: face.id, box: face.box, personId: face.personId, name: person.name, confirmed: face.confirmed, source: face.source })
    .from(face)
    .leftJoin(person, eq(person.id, face.personId))
    .where(and(eq(face.photoId, photoId), eq(face.hidden, false)))
    .orderBy(sql`(${face.box}->>'x')::float nulls last`);
  return rows.map(f => ({
    id: f.id,
    box: f.box ?? null,
    person: f.personId ? { id: f.personId, name: f.name! } : null,
    confirmed: f.confirmed,
    manual: f.source === 'manual',
  }));
}

/** Quién aparece en cada foto de un álbum (solo confirmadas o sugerencias, no ocultas). */
export async function albumPersons(albumId: string) {
  const r = await db.execute<{ photoId: string; personId: string; name: string; faceId: string; hasBox: boolean }>(sql`
    select f.photo_id as "photoId", f.person_id as "personId", p.name, f.id as "faceId", (f.box is not null) as "hasBox"
    from face f join person p on p.id = f.person_id join photo ph on ph.id = f.photo_id
    where ph.album_id = ${albumId} and ph.status = 'ready' and not f.hidden
    order by f.confirmed desc, (f.box is not null) desc, f.score desc nulls last
  `);
  const byPhoto = new Map<string, string[]>();
  const chips = new Map<string, PersonChip & { photos: Set<string> }>();
  for (const x of r.rows) {
    const list = byPhoto.get(x.photoId) ?? [];
    if (!list.includes(x.personId)) list.push(x.personId);
    byPhoto.set(x.photoId, list);
    const c = chips.get(x.personId) ?? { id: x.personId, name: x.name, face: x.faceId, count: 0, photos: new Set() };
    c.photos.add(x.photoId);
    c.count = c.photos.size;
    chips.set(x.personId, c);
  }
  const appearing: PersonChip[] = [...chips.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map(c => ({ id: c.id, name: c.name, face: c.face, count: c.count }));
  return { byPhoto, appearing };
}

/** Busca una persona por nombre entre las que ves (sin distinguir mayúsculas) o la crea. */
export async function findOrCreatePerson(me: string, rawName: string) {
  const name = rawName.trim().replace(/\s+/g, ' ').slice(0, 80);
  const known = (await peopleNames(me)).find(p => p.name.localeCompare(name, 'es', { sensitivity: 'base' }) === 0);
  if (known) return known.id;
  const id = newId();
  await db.insert(person).values({ id, name, createdBy: me });
  return id;
}

/** La cara y el rol de quien la quiere tocar en su álbum. */
export async function faceWithRole(me: string, faceId: string) {
  const r = await db.execute<{ id: string; photoId: string; albumId: string; personId: string | null; source: string; rejected: string[]; role: string | null }>(sql`
    select f.id, f.photo_id as "photoId", ph.album_id as "albumId", f.person_id as "personId", f.source, f.rejected,
      (select role from album_member m where m.album_id = ph.album_id and m.user_id = ${me}) as role
    from face f join photo ph on ph.id = f.photo_id where f.id = ${faceId}
  `);
  return r.rows[0] ?? null;
}
