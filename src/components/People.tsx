'use client';

import Link from 'next/link';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { FaceDTO, PersonChip } from '@/lib/types';
import { Sheet } from './Sheet';

type Name = { id: string; name: string };
type Data = { faces: FaceDTO[]; names: Name[] };

/* Caché compartida entre el dorso y la hoja de "quién aparece" (por foto). */
const cache = new Map<string, Data>();
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
function store(photoId: string, data: Partial<Data>) {
  const prev = cache.get(photoId);
  cache.set(photoId, { faces: data.faces ?? prev?.faces ?? [], names: data.names ?? prev?.names ?? [] });
  listeners.forEach(l => l());
}
const loading = new Set<string>();
function load(photoId: string) {
  if (loading.has(photoId)) return;
  loading.add(photoId);
  fetch(`/api/photos/${photoId}/faces`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => d && store(photoId, d))
    .catch(() => {})
    .finally(() => loading.delete(photoId));
}

export function useFaces(photoId: string, active: boolean) {
  const data = useSyncExternalStore(subscribe, () => cache.get(photoId), () => undefined);
  useEffect(() => {
    if (active && !cache.has(photoId)) load(photoId);
  }, [active, photoId]);
  return data;
}

export const faceUrl = (id: string) => `/media/face/${id}`;

/** Un retrato redondo, recortado de la foto como para un carnet. */
export function FaceDot({ id, size = 32, name }: { id: string | null; size?: number; name?: string }) {
  return (
    <span className="face-dot" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {id ? <img src={faceUrl(id)} alt="" loading="lazy" decoding="async" /> : <span>{name ? name.charAt(0).toUpperCase() : '?'}</span>}
    </span>
  );
}

/** En el dorso: quién aparece en la foto. */
export function BackPeople({ photoId, active, canEdit, onEdit, tab }: { photoId: string; active: boolean; canEdit: boolean; onEdit: () => void; tab: number }) {
  const data = useFaces(photoId, active);
  if (!data) return <span className="who-list muted">…</span>;
  const named = data.faces.filter(f => f.person);
  const unknown = data.faces.length - named.length;
  return (
    <span className="who-list">
      {named.map(f => (
        <span key={f.id} className={`who${f.confirmed ? '' : ' maybe'}`}>
          <FaceDot id={f.box ? f.id : null} size={22} name={f.person!.name} />
          {f.confirmed ? f.person!.name : `¿${f.person!.name}?`}
        </span>
      ))}
      {unknown > 0 && <span className="who muted">{named.length ? `y ${unknown} más` : unknown === 1 ? 'Alguien sin nombre' : `${unknown} personas sin nombre`}</span>}
      {!data.faces.length && <span className="muted">Nadie todavía</span>}
      {canEdit && (
        <button className="link-btn who-edit" type="button" tabIndex={tab} onClick={onEdit}>
          {data.faces.length ? 'Decir quién es quién' : 'Agregar a alguien'}
        </button>
      )}
    </span>
  );
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok) throw new Error(data?.error ?? 'No pudimos guardar el cambio.');
  return data;
}

/** La hoja para nombrar caras, confirmar sugerencias y etiquetar a mano. */
export function WhoSheet({ photoId, onClose, onChanged }: { photoId: string; onClose: () => void; onChanged: () => void }) {
  const data = useFaces(photoId, true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useId();

  async function act(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      const d = await send(url, method, body);
      store(photoId, d);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const named = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    e.currentTarget.reset();
    return v;
  };
  const target = (name: string) => {
    const known = data?.names.find(n => n.name.localeCompare(name, 'es', { sensitivity: 'base' }) === 0);
    return known ? { personId: known.id } : { name };
  };

  return (
    <Sheet title="¿Quién aparece?" sub="Los nombres los ven solo las personas de tus álbumes. Nunca salen en un link público." onClose={onClose}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <datalist id={list}>{data?.names.map(n => <option key={n.id} value={n.name} />)}</datalist>
      {!data ? (
        <p className="hint">Buscando caras…</p>
      ) : (
        <ul className="who-rows">
          {data.faces.map(f => (
            <li key={f.id} className="who-row">
              <FaceDot id={f.box ? f.id : null} size={56} name={f.person?.name} />
              {f.person && f.confirmed ? (
                <div className="who-body">
                  <b>{f.person.name}</b>
                  <span className="who-actions">
                    <button className="link-btn" type="button" disabled={busy} onClick={() => act(`/api/faces/${f.id}`, 'PATCH', { reject: true })}>No es</button>
                    <button className="link-btn" type="button" disabled={busy} onClick={() => act(`/api/faces/${f.id}`, 'DELETE')}>Quitar</button>
                  </span>
                </div>
              ) : f.person ? (
                <div className="who-body">
                  <span>¿Es <b>{f.person.name}</b>?</span>
                  <span className="who-actions">
                    <button className="btn small" type="button" disabled={busy} onClick={() => act(`/api/faces/${f.id}`, 'PATCH', { confirm: true })}>Sí</button>
                    <button className="btn ghost small" type="button" disabled={busy} onClick={() => act(`/api/faces/${f.id}`, 'PATCH', { reject: true })}>No</button>
                  </span>
                </div>
              ) : (
                <form className="who-body" onSubmit={e => { const v = named(e); if (v) act(`/api/faces/${f.id}`, 'PATCH', target(v)); }}>
                  <label className="sr" htmlFor={`n-${f.id}`}>Nombre</label>
                  <input className="input" id={`n-${f.id}`} name="name" list={list} placeholder="¿Quién es?" maxLength={80} autoComplete="off" />
                  <span className="who-actions">
                    <button className="btn small" type="submit" disabled={busy}>Guardar</button>
                    <button className="link-btn" type="button" disabled={busy} onClick={() => act(`/api/faces/${f.id}`, 'PATCH', { hide: true })} title="Alguien de fondo, por ejemplo">Ignorar</button>
                  </span>
                </form>
              )}
            </li>
          ))}
          {!data.faces.length && <li className="hint">No encontramos caras en esta foto. Podés agregar a alguien igual (por ejemplo, si está de espaldas).</li>}
        </ul>
      )}
      <form className="who-add" onSubmit={e => { const v = named(e); if (v) act(`/api/photos/${photoId}/faces`, 'POST', target(v)); }}>
        <label htmlFor="whoAdd">Agregar a alguien que no se detectó</label>
        <div className="row">
          <input className="input" id="whoAdd" name="name" list={list} placeholder="Nombre" maxLength={80} autoComplete="off" />
          <button className="btn ghost" type="submit" disabled={busy}>Agregar</button>
        </div>
      </form>
    </Sheet>
  );
}

/** Fila de personas del álbum: tocar una filtra la mesa. */
export function PeopleFilter({ people, active, onPick }: { people: PersonChip[]; active: string | null; onPick: (id: string | null) => void }) {
  return (
    <div className="people-row" role="group" aria-label="Filtrar por persona">
      {people.map(p => (
        <button key={p.id} type="button" className={`person-chip${active === p.id ? ' on' : ''}`} aria-pressed={active === p.id} onClick={() => onPick(active === p.id ? null : p.id)}>
          <FaceDot id={p.face} size={30} />
          <span>{p.name}</span>
          <small>{p.count}</small>
        </button>
      ))}
      <Link className="people-all" href="/personas">Todas las personas</Link>
    </div>
  );
}
