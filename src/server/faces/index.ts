import 'server-only';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { face, photo } from '../db/schema';
import { newId } from '../ids';
import { getSettings } from '../settings';
import { storagePath, variantKey } from '../storage';
import { cosine, findFaces, loadSessions, normalize, readRgb } from './engine';
import { ensureModels, modelPath, modelsState } from './models';

/**
 * Reconocimiento facial en segundo plano. Recorre las fotos reveladas que todavía
 * no se revisaron (`photo.faces_scanned_at`), de a una y cediendo el paso cuando
 * hay fotos revelándose. Todo corre en este servidor.
 */

/** Desde acá una cara se sugiere como de una persona ya nombrada. */
export const ASSIGN = 0.45;
/** Desde acá dos caras sin nombre se agrupan como la misma persona. */
export const CLUSTER = 0.45;
/** Al volver a escanear (por ejemplo, al girar una foto) se reconoce la misma cara desde acá. */
const SAME_FACE = 0.6;

type Centroid = { sum: Float32Array; n: number };
type State = { running: boolean; again: boolean; centroids: Map<string, Centroid> | null; scanned: number };
const g = globalThis as unknown as { __memoriesFaces?: State };
const st = (g.__memoriesFaces ??= { running: false, again: false, centroids: null, scanned: 0 });

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Hay fotos revelándose (estado de la cola de photos/queue.ts): las caras esperan su turno. */
const queueBusy = () => {
  const q = (globalThis as unknown as { __memoriesQueue?: { running: number; pending: string[] } }).__memoriesQueue;
  return !!q && (q.running > 0 || q.pending.length > 0);
};

/** Arranca (o despierta) la búsqueda de caras. Se puede llamar todas las veces que haga falta. */
export function kickFaces() {
  if (st.running) {
    st.again = true;
    return;
  }
  st.running = true;
  loop()
    .catch(err => console.error('[memories] búsqueda de caras:', err))
    .finally(() => {
      st.running = false;
    });
}

async function loop() {
  if (!(await getSettings()).faces) return;
  if (!(await ensureModels())) return;
  const s = await loadSessions(modelPath('yunet'), modelPath('sface'));
  for (;;) {
    if (!(await getSettings()).faces) return;
    const batch = await db
      .select({ id: photo.id })
      .from(photo)
      .where(and(eq(photo.status, 'ready'), isNull(photo.facesScannedAt)))
      .orderBy(desc(photo.createdAt))
      .limit(10);
    if (!batch.length) {
      if (st.again) {
        st.again = false;
        continue;
      }
      return;
    }
    for (const b of batch) {
      while (queueBusy()) await wait(500);
      try {
        await scanPhoto(s, b.id);
      } catch (err) {
        console.error(`[memories] no se pudieron buscar caras en ${b.id}:`, err instanceof Error ? err.message : err);
        await db.update(photo).set({ facesScannedAt: new Date() }).where(eq(photo.id, b.id));
      }
      st.scanned++;
    }
  }
}

/* ---------- Centroides: el "promedio" de las caras confirmadas de cada persona ---------- */

async function centroids() {
  if (st.centroids) return st.centroids;
  const rows = await db
    .select({ personId: face.personId, embedding: face.embedding })
    .from(face)
    .where(and(isNotNull(face.personId), isNotNull(face.embedding), eq(face.confirmed, true), eq(face.hidden, false)));
  const map = new Map<string, Centroid>();
  for (const r of rows) {
    const c = map.get(r.personId!) ?? { sum: new Float32Array(128), n: 0 };
    r.embedding!.forEach((v, i) => (c.sum[i] += v));
    c.n++;
    map.set(r.personId!, c);
  }
  st.centroids = map;
  return map;
}

/** Hay que recalcular los promedios (se nombró, confirmó o quitó una cara). */
export function facesChanged() {
  st.centroids = null;
}

async function matchPerson(e: ArrayLike<number>, rejected: string[] = []) {
  let best: string | null = null;
  let bestSim = ASSIGN;
  for (const [id, c] of await centroids()) {
    if (rejected.includes(id)) continue;
    const sim = cosine(e, normalize(c.sum));
    if (sim >= bestSim) {
      bestSim = sim;
      best = id;
    }
  }
  return best;
}

async function scanPhoto(s: Awaited<ReturnType<typeof loadSessions>>, id: string) {
  const [p] = await db.select({ id: photo.id, status: photo.status }).from(photo).where(eq(photo.id, id));
  if (!p || p.status !== 'ready') return;
  const img = await readRgb(storagePath(variantKey(id, 'display')));
  const found = await findFaces(s, img);
  const old = await db.select().from(face).where(and(eq(face.photoId, id), eq(face.source, 'auto')));

  const rows: (typeof face.$inferInsert)[] = [];
  const matched = new Set<string>();
  for (const f of found) {
    // Si la foto ya se había escaneado (se giró), conserva lo que se había dicho de cada cara
    let prev: (typeof old)[number] | undefined;
    let prevSim = SAME_FACE;
    for (const o of old) {
      if (!o.embedding || matched.has(o.id)) continue;
      const sim = cosine(f.embedding, o.embedding);
      if (sim >= prevSim) { prevSim = sim; prev = o; }
    }
    if (prev) matched.add(prev.id);
    const rejected = prev?.rejected ?? [];
    const hidden = prev?.hidden ?? false;
    let personId = prev?.personId ?? null;
    if (!personId && !hidden) personId = await matchPerson(f.embedding, rejected);
    rows.push({
      id: newId(),
      photoId: id,
      personId,
      box: { x: f.x / img.width, y: f.y / img.height, w: f.w / img.width, h: f.h / img.height },
      embedding: Array.from(f.embedding),
      score: f.score,
      source: 'auto',
      confirmed: prev?.confirmed ?? false,
      hidden,
      rejected,
    });
  }
  // Las caras con nombre (u ocultas) que esta vez no se encontraron se quedan: lo que dijo una persona no se pierde
  const gone = old.filter(o => matched.has(o.id) || (!o.personId && !o.hidden)).map(o => o.id);
  await db.transaction(async tx => {
    if (gone.length) await tx.delete(face).where(inArray(face.id, gone));
    if (rows.length) await tx.insert(face).values(rows);
    await tx.update(photo).set({ facesScannedAt: new Date() }).where(eq(photo.id, id));
  });
  if (old.some(o => o.confirmed && matched.has(o.id))) facesChanged();
}

/** Busca, entre las caras sin nombre, las que se parecen a esta persona y se las sugiere. */
export async function suggestFor(personId: string) {
  facesChanged();
  const c = (await centroids()).get(personId);
  if (!c) return 0;
  const center = normalize(c.sum);
  const pool = await db
    .select({ id: face.id, embedding: face.embedding, rejected: face.rejected })
    .from(face)
    .where(and(isNull(face.personId), eq(face.hidden, false), isNotNull(face.embedding)));
  const ids = pool.filter(f => !f.rejected.includes(personId) && cosine(f.embedding!, center) >= ASSIGN).map(f => f.id);
  for (let i = 0; i < ids.length; i += 500) {
    await db.update(face).set({ personId, confirmed: false }).where(inArray(face.id, ids.slice(i, i + 500)));
  }
  return ids.length;
}

/**
 * Cuando se gira una foto, los recuadros giran con ella (la huella de cada cara no cambia)
 * y la foto se vuelve a revisar, por si estaba de costado y recién ahora se ven las caras.
 * `turn` es en sentido horario: 90, -90 o 180.
 */
export async function rotateFaces(photoId: string, turn: 90 | -90 | 180) {
  const rows = await db.select({ id: face.id, box: face.box }).from(face).where(and(eq(face.photoId, photoId), isNotNull(face.box)));
  for (const r of rows) {
    const { x, y, w, h } = r.box!;
    const box =
      turn === 90 ? { x: 1 - y - h, y: x, w: h, h: w } : turn === -90 ? { x: y, y: 1 - x - w, w: h, h: w } : { x: 1 - x - w, y: 1 - y - h, w, h };
    await db.update(face).set({ box }).where(eq(face.id, r.id));
  }
  await db.update(photo).set({ facesScannedAt: null }).where(eq(photo.id, photoId));
}

export async function facesStatus() {
  const [{ total, scanned, faces, people }] = (
    await db.execute<{ total: number; scanned: number; faces: number; people: number }>(sql`
      select
        (select count(*) from photo where status = 'ready')::int as total,
        (select count(*) from photo where status = 'ready' and faces_scanned_at is not null)::int as scanned,
        (select count(*) from face where source = 'auto')::int as faces,
        (select count(*) from person)::int as people
    `)
  ).rows;
  return { models: await modelsState(), running: st.running, total, scanned, faces, people };
}

/** Borra todo lo aprendido: caras detectadas y personas. Las etiquetas a mano también. */
export async function forgetFaces() {
  await db.execute(sql`delete from face`);
  await db.execute(sql`delete from person`);
  await db.update(photo).set({ facesScannedAt: null });
  facesChanged();
}
