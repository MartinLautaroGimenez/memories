'use client';

import { useCallback, useEffect, useRef } from 'react';
import { plural } from '@/lib/format';
import type { PhotoDTO } from '@/lib/types';
import type { LocalPhoto } from './Print';

const ACCEPT = /\.(jpe?g|png|webp|avif|gif|tiff?|heic|heif)$/i;
const PARALLEL = 3;

type Item = { file: File; localId: string };

/**
 * Sube fotos de a tres, muestra cada una "latente" mientras sube y se procesa,
 * y consulta el estado hasta que termina de revelarse.
 */
export function useUploads(opts: {
  albumId: string;
  me: { id: string; name: string } | null;
  setPhotos: React.Dispatch<React.SetStateAction<LocalPhoto[]>>;
  initialPending: string[];
  toast: (m: string) => void;
}) {
  const { albumId, setPhotos, toast } = opts;
  const queue = useRef<Item[]>([]);
  const active = useRef(0);
  const pending = useRef(new Set<string>(opts.initialPending));
  const urls = useRef<string[]>([]);
  const batch = useRef({ ready: 0, failed: 0, total: 0 });
  const seq = useRef(0);
  const me = useRef(opts.me);
  const pumpRef = useRef<() => void>(() => {});

  const patch = useCallback((id: string, next: (p: LocalPhoto) => LocalPhoto) => {
    setPhotos(ps => ps.map(p => (p.id === id ? next(p) : p)));
  }, [setPhotos]);

  const finishBatch = useCallback(() => {
    const b = batch.current;
    if (!b.total || queue.current.length || active.current || pending.current.size) return;
    if (b.ready) toast(b.ready === 1 ? '1 foto revelada' : `${b.ready} fotos reveladas`);
    else if (b.failed) toast(b.failed === 1 ? 'No pudimos revelar la foto' : `No pudimos revelar ${plural(b.failed, 'foto', 'fotos')}`);
    batch.current = { ready: 0, failed: 0, total: 0 };
  }, [toast]);

  const upload = useCallback(async (item: Item) => {
    const { file, localId } = item;
    let res: Response | null = null;
    try {
      res = await fetch(`/api/albums/${albumId}/photos`, {
        method: 'POST',
        body: file,
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name),
          'x-last-modified': String(file.lastModified || Date.now()),
        },
      });
    } catch {
      res = null;
    }
    const data = await res?.json().catch(() => null);
    if (res?.ok && data?.photo) {
      const real = data.photo as PhotoDTO;
      setPhotos(ps => ps.map(p => (p.id === localId ? { ...real, local: p.local } : p)));
      pending.current.add(real.id);
    } else {
      batch.current.failed++;
      const msg = data?.error ?? `No pudimos subir ${file.name}. Revisá tu conexión y probá de nuevo.`;
      patch(localId, p => ({ ...p, status: 'failed', error: msg }));
    }
  }, [albumId, patch, setPhotos]);

  const pump = useCallback(() => {
    while (active.current < PARALLEL && queue.current.length) {
      const item = queue.current.shift()!;
      active.current++;
      upload(item).finally(() => {
        active.current--;
        pumpRef.current();
        finishBatch();
      });
    }
  }, [upload, finishBatch]);
  useEffect(() => { pumpRef.current = pump; }, [pump]);

  const add = useCallback((files: File[]) => {
    const ok: File[] = [];
    for (const f of files) {
      if (f.type.startsWith('image/') || ACCEPT.test(f.name)) ok.push(f);
      else toast(`${f.name} no es una foto. Probá con JPG, PNG, WebP o HEIC.`);
    }
    if (!ok.length) return;
    const placeholders: LocalPhoto[] = ok.map(f => {
      const localId = `local-${++seq.current}`;
      const url = URL.createObjectURL(f);
      urls.current.push(url);
      queue.current.push({ file: f, localId });
      const im = new Image();
      im.onload = () => patch(localId, p => ({ ...p, local: { url, w: im.naturalWidth, h: im.naturalHeight } }));
      im.src = url;
      return {
        id: localId, status: 'processing', w: null, h: null, color: null, thumbhash: null, takenAt: null, note: '',
        camera: null, exposure: null, file: f.name, by: me.current, error: null, local: { url },
      };
    });
    batch.current.total += ok.length;
    setPhotos(ps => [...placeholders, ...ps]);
    pump();
  }, [patch, pump, setPhotos, toast]);

  // Consulta el estado de las fotos que se están procesando
  useEffect(() => {
    const t = setInterval(async () => {
      if (!pending.current.size) return;
      const ids = [...pending.current].slice(0, 100);
      const res = await fetch(`/api/albums/${albumId}/photos?ids=${ids.join(',')}`).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!data?.photos) return;
      const done = (data.photos as PhotoDTO[]).filter(p => p.status !== 'processing');
      if (!done.length) return;
      for (const d of done) {
        pending.current.delete(d.id);
        if (d.status === 'ready') batch.current.ready++;
        else batch.current.failed++;
      }
      const byId = new Map(done.map(d => [d.id, d]));
      setPhotos(ps => ps.map(p => (byId.has(p.id) ? { ...byId.get(p.id)!, local: p.local } : p)));
      finishBatch();
    }, 1500);
    return () => clearInterval(t);
  }, [albumId, setPhotos, finishBatch]);

  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), []);

  return { add };
}
