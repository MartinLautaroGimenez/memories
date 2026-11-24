import 'server-only';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { photo } from '../db/schema';
import { env } from '../env';
import { readBuffer, storagePath } from '../storage';
import { renderPhoto } from './render';

/**
 * Cola de procesamiento dentro del mismo proceso.
 * La fuente de verdad es la tabla `photo`: todo lo que queda en `processing`
 * se retoma al reiniciar (ver `resumePending`). El estado vive en globalThis
 * porque Next.js carga este módulo en más de un bundle.
 */
type QueueState = { pending: string[]; inflight: Set<string>; running: number };
const g = globalThis as unknown as { __memoriesQueue?: QueueState };
const q: QueueState = (g.__memoriesQueue ??= { pending: [], inflight: new Set(), running: 0 });

const MAX_ATTEMPTS = 3;

export function enqueue(photoId: string) {
  if (q.inflight.has(photoId) || q.pending.includes(photoId)) return;
  q.pending.push(photoId);
  pump();
}

function pump() {
  while (q.running < env.PROCESS_CONCURRENCY && q.pending.length) {
    const id = q.pending.shift()!;
    q.running++;
    q.inflight.add(id);
    processPhoto(id)
      .catch(err => console.error(`[memories] error procesando ${id}:`, err))
      .finally(() => {
        q.running--;
        q.inflight.delete(id);
        pump();
      });
  }
}

export async function processPhoto(id: string) {
  const [p] = await db.select().from(photo).where(eq(photo.id, id));
  if (!p || p.status !== 'processing') return;
  const attempts = p.attempts + 1;
  await db.update(photo).set({ attempts }).where(eq(photo.id, id));
  try {
    const buf = await readBuffer(p.originalKey);
    const r = await renderPhoto(buf, p.mime, p.originalName, storagePath(`variants/${id}`), p.rotation);
    // La primera vez se toma la fecha del EXIF; después se respetan las correcciones hechas a mano.
    const firstTime = !p.exifTakenAt && !p.width;
    await db
      .update(photo)
      .set({
        width: r.width,
        height: r.height,
        takenAt: firstTime ? (r.takenAt ?? p.takenAt) : p.takenAt,
        exifTakenAt: p.exifTakenAt ?? r.takenAt ?? p.takenAt,
        lat: firstTime ? r.lat : p.lat,
        lng: firstTime ? r.lng : p.lng,
        camera: firstTime ? r.camera : p.camera,
        exposure: r.exposure,
        color: r.color,
        thumbhash: r.thumbhash,
        variants: r.variants,
        status: 'ready',
        error: null,
      })
      .where(eq(photo.id, id));
  } catch (err) {
    const failed = attempts >= MAX_ATTEMPTS;
    console.error(`[memories] no se pudo procesar ${p.originalName} (intento ${attempts}):`, err instanceof Error ? err.message : err);
    await db
      .update(photo)
      .set({
        status: failed ? 'failed' : 'processing',
        error: `No pudimos leer ${p.originalName}. Probá exportarla como JPG.`,
      })
      .where(eq(photo.id, id));
    if (!failed) setTimeout(() => enqueue(id), 4000 * attempts);
  }
}

/** Retoma las fotos que quedaron a medio procesar (por ejemplo, tras un reinicio). */
export async function resumePending() {
  const rows = await db
    .select({ id: photo.id })
    .from(photo)
    .where(and(eq(photo.status, 'processing'), lt(photo.attempts, MAX_ATTEMPTS)))
    .orderBy(sql`${photo.createdAt} asc`);
  rows.forEach(r => enqueue(r.id));
  if (rows.length) console.log(`[memories] retomando ${rows.length} foto(s) pendientes`);
}
