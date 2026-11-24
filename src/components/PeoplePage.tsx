'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { PhotoDTO } from '@/lib/types';
import { FaceDot } from './People';
import { PhotoImage } from './Print';
import { useToast } from './Toast';

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok) throw new Error(data?.error ?? 'No pudimos guardar el cambio.');
  return data;
}

/** Un grupo de caras parecidas sin nombre: "¿Quién es?". */
export function NameGroup({ faces, names }: { faces: string[]; names: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useId();
  const shown = faces.slice(0, 7);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    setBusy(true);
    try {
      const d = await send('/api/people', 'POST', { name, faceIds: faces });
      toast(`Listo: ${name}`);
      router.push(`/personas/${d.personId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function ignore() {
    setBusy(true);
    await Promise.all(faces.map(id => send(`/api/faces/${id}`, 'PATCH', { hide: true }).catch(() => null)));
    router.refresh();
  }

  return (
    <form className="who-group" onSubmit={save}>
      <div className="who-faces" aria-hidden="true">
        {shown.map(id => <FaceDot key={id} id={id} size={64} />)}
        {faces.length > shown.length && <span className="who-more">+{faces.length - shown.length}</span>}
      </div>
      <datalist id={list}>{names.map(n => <option key={n} value={n} />)}</datalist>
      <div className="row">
        <label className="sr" htmlFor={`${list}-n`}>Nombre</label>
        <input className="input" id={`${list}-n`} name="name" list={list} placeholder={`¿Quién es? (${faces.length} fotos)`} maxLength={80} autoComplete="off" />
        <button className="btn" type="submit" disabled={busy}>Guardar</button>
        <button className="link-btn" type="button" disabled={busy} onClick={ignore}>Ignorar</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

/** Cambiar el nombre, unir con otra persona u olvidarla. */
export function PersonTools({ id, name, others }: { id: string; name: string; others: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<'idle' | 'rename' | 'merge' | 'forget'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="person-tools">
      {mode === 'idle' && (
        <div className="row">
          <button className="btn ghost" type="button" onClick={() => setMode('rename')}>Cambiar el nombre</button>
          {others.length > 0 && <button className="btn ghost" type="button" onClick={() => setMode('merge')}>Es la misma que…</button>}
          <button className="link-btn" type="button" onClick={() => setMode('forget')}>Olvidar</button>
        </div>
      )}
      {mode === 'rename' && (
        <form
          className="row"
          onSubmit={e => {
            e.preventDefault();
            const v = String(new FormData(e.currentTarget).get('name') ?? '').trim();
            if (v) run(async () => { await send(`/api/people/${id}`, 'PATCH', { name: v }); setMode('idle'); router.refresh(); });
          }}
        >
          <label className="sr" htmlFor="pName">Nombre</label>
          <input className="input" id="pName" name="name" defaultValue={name} maxLength={80} autoFocus />
          <button className="btn" type="submit" disabled={busy}>Guardar</button>
          <button className="btn ghost" type="button" onClick={() => setMode('idle')}>Cancelar</button>
        </form>
      )}
      {mode === 'merge' && (
        <form
          className="row"
          onSubmit={e => {
            e.preventDefault();
            const target = String(new FormData(e.currentTarget).get('target') ?? '');
            if (target) run(async () => { await send(`/api/people/${id}`, 'PATCH', { mergeInto: target }); toast('Personas unidas'); router.push(`/personas/${target}`); });
          }}
        >
          <label className="sr" htmlFor="pMerge">Persona</label>
          <select className="input" id="pMerge" name="target" defaultValue="">
            <option value="" disabled>Elegí a quién</option>
            {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button className="btn" type="submit" disabled={busy}>Unir</button>
          <button className="btn ghost" type="button" onClick={() => setMode('idle')}>Cancelar</button>
        </form>
      )}
      {mode === 'forget' && (
        <div className="row">
          <span className="hint">Sus caras quedan sin nombre. Las fotos no se tocan.</span>
          <button className="btn danger" type="button" disabled={busy} onClick={() => run(async () => { await send(`/api/people/${id}`, 'DELETE'); router.push('/personas'); router.refresh(); })}>Olvidar a {name}</button>
          <button className="btn ghost" type="button" onClick={() => setMode('idle')}>Cancelar</button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

type Item = { photoId: string; faceId: string; confirmed: boolean; slug: string; title: string; takenAt: string | null; w: number | null; h: number | null; thumbhash: string | null; color: string | null };

const asPhoto = (x: Item): PhotoDTO => ({
  id: x.photoId, status: 'ready', w: x.w, h: x.h, color: x.color, thumbhash: x.thumbhash, takenAt: x.takenAt, note: '', camera: null, exposure: null,
  file: '', by: null, error: null, place: null, exifTakenAt: null, guestName: null, fav: false, lat: null, lng: null, comments: 0, reactions: {}, myReactions: [],
});

/** Las fotos de una persona; las sugeridas se confirman o descartan acá mismo. */
export function PersonPhotos({ items, name }: { items: Item[]; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function decide(x: Item, yes: boolean) {
    setBusy(x.faceId);
    await send(`/api/faces/${x.faceId}`, 'PATCH', yes ? { confirm: true } : { reject: true }).catch(() => null);
    setBusy(null);
    router.refresh();
  }
  return (
    <ol className="person-photos">
      {items.map(x => (
        <li key={x.photoId} className={x.confirmed ? '' : 'maybe'}>
          <Link href={`/a/${x.slug}?foto=${x.photoId}`} className="print ready" title={x.title}>
            <div className="paper">
              <PhotoImage photo={asPhoto(x)} stamp />
            </div>
          </Link>
          {x.confirmed ? (
            <small>{x.title}</small>
          ) : (
            <span className="maybe-row">
              <FaceDot id={x.faceId} size={28} />
              <span>¿Es {name}?</span>
              <button className="btn small" type="button" disabled={busy === x.faceId} onClick={() => decide(x, true)}>Sí</button>
              <button className="btn ghost small" type="button" disabled={busy === x.faceId} onClick={() => decide(x, false)}>No</button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
