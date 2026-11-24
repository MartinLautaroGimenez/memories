'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { plural } from '@/lib/format';
import type { AlbumCardDTO } from '@/lib/types';
import type { OnThisDay } from '@/server/albums';
import Link from 'next/link';
import { fmtDate } from '@/lib/format';
import { Print } from './Print';
import { setPendingFiles } from './handoff';
import { IconGlobe, IconPeople, IconPlus } from './icons';
import { dealIn } from './motion';
import { Sheet } from './Sheet';
import { Stack } from './Stack';
import { useToast } from './Toast';
import { useDropFiles } from './useDropFiles';

/** "Tu mesa": todas las pilas de álbumes. */
export function Table({ cards, meId, memory, atlas, people }: { cards: AlbumCardDTO[]; meId: string; memory?: OnThisDay | null; atlas?: boolean; people?: boolean }) {
  const [creating, setCreating] = useState<{ files: File[] } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const total = cards.reduce((n, c) => n + c.count, 0);

  useEffect(() => {
    if (grid.current) dealIn([...grid.current.children], 60, 80);
  }, []);

  const onFiles = useCallback((files: File[]) => setCreating({ files }), []);
  const dragging = useDropFiles(onFiles);

  return (
    <section>
      <div className="home-head">
        <h1 className="home-title">Tu mesa</h1>
        <div className="home-side">
          {cards.length > 0 && (
            <p className="home-sub">
              {plural(cards.length, 'álbum', 'álbumes')} y {plural(total, 'foto', 'fotos')} de viajes y eventos. Abrí una pila para ver el álbum completo.
            </p>
          )}
          <div className="home-actions">
            {people && (
              <Link className="btn ghost" href="/personas">
                <IconPeople />
                Personas
              </Link>
            )}
            {atlas && (
              <Link className="btn ghost" href="/atlas">
                <IconGlobe />
                Atlas
              </Link>
            )}
            <button className="btn" type="button" onClick={() => setCreating({ files: [] })}>
              <IconPlus />
              Nuevo álbum
            </button>
          </div>
        </div>
      </div>

      {memory && <Memory m={memory} />}

      {cards.length ? (
        <div className="stacks" ref={grid}>
          {cards.map(c => (
            <Stack key={c.id} card={c} meId={meId} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="print empty-sheet">
            <div className="paper">
              <div className="photo" style={{ ['--ar' as string]: 1.5 }} />
              <p className="print-note">Acá va tu primer viaje</p>
            </div>
          </div>
          <h2>Esta mesa está vacía</h2>
          <p>Creá un álbum para un viaje, un cumpleaños o un recital, o soltá tus fotos acá y lo armamos con ellas.</p>
        </div>
      )}

      {creating && <NewAlbumSheet files={creating.files} onClose={() => setCreating(null)} />}
      {dragging && !creating && (
        <div className="drop">
          Soltá las fotos
          <br />
          sobre la mesa
        </div>
      )}
    </section>
  );
}

function NewAlbumSheet({ files, onClose }: { files: File[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    const res = await fetch('/api/albums', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: fd.get('title'), place: fd.get('place') }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setError(data?.error ?? 'No pudimos crear el álbum. Revisá tu conexión y probá de nuevo.');
      return;
    }
    if (files.length) setPendingFiles(files);
    toast('Álbum creado');
    router.push(`/a/${data.slug}`);
  }

  return (
    <Sheet
      title="Nuevo álbum"
      sub={files.length ? `Vas a subir ${plural(files.length, 'foto', 'fotos')}. Ponele nombre al álbum.` : 'Un viaje, un cumpleaños, un recital. Después invitás a quienes estuvieron.'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="field">
          <label htmlFor="title">Nombre</label>
          <input className="input" id="title" name="title" required maxLength={120} placeholder="Bariloche con amigos" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="place">Lugar (opcional)</label>
          <input className="input" id="place" name="place" maxLength={160} placeholder="Bariloche, Río Negro" autoComplete="off" />
        </div>
        <div className="form-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creando…' : files.length ? 'Crear y subir fotos' : 'Crear álbum'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** Una foto de estos mismos días, de hace uno o más años. */
function Memory({ m }: { m: OnThisDay }) {
  const ar = m.photo.w && m.photo.h ? m.photo.w / m.photo.h : 1.5;
  return (
    <Link className="memory" href={`/a/${m.album.slug}`} aria-label={`Hace ${m.years === 1 ? 'un año' : `${m.years} años`}: ${m.album.title}`}>
      <Print photo={m.photo} className="memory-print" stamp style={{ ['--mw' as string]: ar >= 1 ? '230px' : '170px' }} />
      <span className="memory-text">
        <span className="memory-when">Hace {m.years === 1 ? 'un año' : `${m.years} años`}</span>
        <span className="memory-what">{m.album.title}{m.photo.takenAt ? `, ${fmtDate(m.photo.takenAt)}` : ''}</span>
        {m.photo.note && <span className="memory-note">{m.photo.note}</span>}
      </span>
    </Link>
  );
}
