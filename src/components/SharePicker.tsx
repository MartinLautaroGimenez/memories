'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { plural } from '@/lib/format';
import { setPendingFiles } from './handoff';
import { mediaUrl } from './Print';

type Album = { id: string; slug: string; title: string; place: string; count: number; cover: string | null; rot: number | null };
const SHARE = 'memories-share';

/** Lee las fotos que guardó el service worker al compartir desde otra app. */
async function readShared(): Promise<File[]> {
  if (!('caches' in window)) return [];
  const cache = await caches.open(SHARE);
  const files: File[] = [];
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    if (!res) continue;
    const blob = await res.blob();
    files.push(new File([blob], decodeURIComponent(res.headers.get('x-name') ?? 'foto.jpg'), { type: blob.type, lastModified: Number(res.headers.get('x-modified')) || Date.now() }));
  }
  return files;
}

export function SharePicker({ albums }: { albums: Album[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [files, setFiles] = useState<File[] | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('error') ? 'No pudimos recibir las fotos. Probá compartirlas de nuevo.' : '');

  useEffect(() => {
    let urls: string[] = [];
    readShared()
      .then(f => {
        setFiles(f);
        urls = f.slice(0, 8).map(x => URL.createObjectURL(x));
        setThumbs(urls);
      })
      .catch(() => setFiles([]));
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, []);

  function go(slug: string) {
    if (!files?.length) return;
    setPendingFiles(files);
    caches.delete(SHARE).catch(() => {});
    router.push(`/a/${slug}`);
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
    if (!title) return;
    setBusy(true);
    const res = await fetch('/api/albums', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, place: '' }) }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!res?.ok) { setBusy(false); return setError(d?.error ?? 'No pudimos crear el álbum.'); }
    go(d.slug);
  }

  if (files === null) return <p className="home-sub">Buscando las fotos…</p>;
  if (!files.length) {
    return (
      <div className="empty">
        <h2>No llegó ninguna foto</h2>
        <p>Desde la galería del celu, elegí fotos, tocá Compartir y después Memories. Para eso, Memories tiene que estar instalada como app.</p>
      </div>
    );
  }

  return (
    <div className="share-pick">
      <div className="share-fan" aria-label={plural(files.length, 'foto para subir', 'fotos para subir')}>
        {thumbs.map((u, i) => (
          <img key={u} src={u} alt="" style={{ ['--i' as string]: i - (thumbs.length - 1) / 2 }} />
        ))}
        <p className="home-sub">{plural(files.length, 'foto lista', 'fotos listas')} para subir.</p>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ul className="share-albums">
        {albums.map(a => (
          <li key={a.id}>
            <button type="button" onClick={() => go(a.slug)}>
              <span className="share-cover">{a.cover && <img src={mediaUrl({ id: a.cover, rot: a.rot ?? 0 }, 'thumb')} alt="" loading="lazy" />}</span>
              <span className="share-title">{a.title}</span>
              <span className="share-meta">{[a.place, plural(a.count, 'foto', 'fotos')].filter(Boolean).join(', ')}</span>
            </button>
          </li>
        ))}
      </ul>
      <form className="share-new" onSubmit={create}>
        <label htmlFor="shareNew">O en un álbum nuevo</label>
        <div className="row">
          <input className="input" id="shareNew" name="title" placeholder="Nombre del álbum" maxLength={120} required />
          <button className="btn" type="submit" disabled={busy}>Crear y subir</button>
        </div>
      </form>
    </div>
  );
}
