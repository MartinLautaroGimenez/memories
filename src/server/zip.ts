import 'server-only';
import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { photo } from './db/schema';
import { storagePath } from './storage';

/** Nombre de archivo seguro y sin repetidos dentro del ZIP. */
function uniqueName(name: string, used: Set<string>) {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'foto.jpg';
  const dot = clean.lastIndexOf('.');
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  let candidate = clean;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base} (${i})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Arma un ZIP con los originales, sin comprimir (las fotos ya vienen comprimidas). */
export async function albumZip(albumId: string, title: string, ids?: string[]) {
  const where = ids?.length ? and(eq(photo.albumId, albumId), inArray(photo.id, ids)) : eq(photo.albumId, albumId);
  const rows = await db
    .select({ key: photo.originalKey, name: photo.originalName, takenAt: photo.takenAt })
    .from(photo)
    .where(and(where, eq(photo.status, 'ready')))
    .orderBy(sql`${photo.takenAt} asc nulls last`, asc(photo.createdAt));
  const out = new PassThrough();
  const zip = archiver('zip', { store: true });
  zip.on('warning', err => console.warn('[memories] zip:', err.message));
  zip.on('error', err => out.destroy(err));
  zip.pipe(out);
  const used = new Set<string>();
  for (const r of rows) zip.file(storagePath(r.key), { name: uniqueName(r.name, used), date: r.takenAt ?? undefined });
  void zip.finalize();
  const file = `${title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || 'album'}.zip`;
  return new Response(Readable.toWeb(out) as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
