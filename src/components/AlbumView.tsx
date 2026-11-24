'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { plural, rangeText, sameDay } from '@/lib/format';
import { namesList } from '@/lib/people';
import type { AlbumDTO } from '@/lib/types';
import { Avatars } from './Avatars';
import { Carousel, type CarouselHandle } from './Carousel';
import { DateStamp } from './DateStamp';
import { takePendingFiles } from './handoff';
import { IconBack, IconShare, IconUpload } from './icons';
import { EASE, reducedMotion } from './motion';
import type { LocalPhoto } from './Print';
import { SettingsSheet, ShareSheet } from './ShareSheet';
import { Spread, type SpreadHandle } from './Spread';
import { useToast } from './Toast';
import { useDropFiles } from './useDropFiles';
import { useUploads } from './useUploads';
import { Viewer } from './Viewer';

type Me = { id: string; name: string } | null;

export function AlbumView({ album, me }: { album: AlbumDTO; me: Me }) {
  const router = useRouter();
  const toast = useToast();
  const isPublic = album.role === 'public';
  const canUpload = album.role === 'owner' || album.role === 'contributor';
  const isOwner = album.role === 'owner';

  const [photos, setPhotos] = useState<LocalPhoto[]>(album.photos);
  const [mode, setMode] = useState<'mesa' | 'carrusel'>('mesa');
  const [viewer, setViewer] = useState<{ start: number } | null>(null);
  const [sheet, setSheet] = useState<'share' | 'settings' | null>(null);
  const [moved, setMoved] = useState(false);
  const spread = useRef<SpreadHandle>(null);
  const carousel = useRef<CarouselHandle>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const seg = useRef<HTMLDivElement>(null);
  const noteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Si el servidor trae datos nuevos (por ejemplo tras renombrar), los toma sin perder las subidas locales.
  const [serverPhotos, setServerPhotos] = useState(album.photos);
  if (serverPhotos !== album.photos) {
    setServerPhotos(album.photos);
    const ids = new Set(album.photos.map(p => p.id));
    const local = photos.filter(p => (p.id.startsWith('local-') || p.local) && !ids.has(p.id));
    setPhotos([...local, ...album.photos.map(p => ({ ...p, local: photos.find(x => x.id === p.id)?.local }))]);
  }

  const visible = useMemo(
    () => photos.filter(p => p.status !== 'failed' || isOwner || p.by?.id === me?.id || p.id.startsWith('local-')),
    [photos, isOwner, me?.id],
  );
  const ready = useMemo(() => photos.filter(p => p.status === 'ready'), [photos]);
  // El rango de fechas sale de las fotos reveladas, así se actualiza con cada subida.
  const [from, to] = useMemo(() => {
    const dates = ready.map(p => p.takenAt).filter((d): d is string => !!d).sort();
    return dates.length ? [dates[0], dates[dates.length - 1]] : [album.from, album.to];
  }, [ready, album.from, album.to]);

  const uploads = useUploads({
    albumId: album.id,
    me,
    setPhotos,
    initialPending: album.photos.filter(p => p.status === 'processing').map(p => p.id),
    toast,
  });

  useEffect(() => {
    const files = takePendingFiles();
    if (files?.length && canUpload) uploads.add(files);
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dragging = useDropFiles(canUpload ? uploads.add : null);

  // El título se expande con el eje de ancho de la tipografía.
  useEffect(() => {
    if (reducedMotion() || !titleRef.current) return;
    titleRef.current.animate(
      [{ fontStretch: '62%', opacity: 0 }, { fontStretch: '62%', opacity: 1, offset: 0.15 }, { fontStretch: '125%', opacity: 1 }],
      { duration: 760, easing: EASE },
    );
  }, []);

  // Pastilla del selector Mesa / Carrusel
  useLayoutEffect(() => {
    const el = seg.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>('button[aria-pressed="true"]');
      const thumb = el.querySelector<HTMLElement>('.seg-thumb');
      if (!on || !thumb) return;
      thumb.style.width = `${on.offsetWidth}px`;
      thumb.style.transform = `translateX(${on.offsetLeft - 4}px)`;
    };
    place();
    document.fonts?.ready.then(place);
  }, [mode]);

  const sourceFor = useCallback(
    (id: string) => {
      if (mode === 'carrusel') {
        const i = ready.findIndex(p => p.id === id);
        return i >= 0 ? carousel.current?.windowFor(i) ?? null : null;
      }
      return spread.current?.printFor(id) ?? null;
    },
    [mode, ready],
  );

  const saveNote = useCallback((id: string, note: string) => {
    setPhotos(ps => ps.map(p => (p.id === id ? { ...p, note } : p)));
    const timers = noteTimers.current;
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(async () => {
        timers.delete(id);
        const res = await fetch(`/api/photos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note }) }).catch(() => null);
        if (!res?.ok) toast('No pudimos guardar la nota. Revisá tu conexión.');
      }, 700),
    );
  }, [toast]);

  const removePhoto = useCallback(async (id: string) => {
    if (id.startsWith('local-')) {
      setPhotos(ps => ps.filter(p => p.id !== id));
      return true;
    }
    const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      toast(data?.error ?? 'No pudimos borrar la foto. Probá de nuevo.');
      return false;
    }
    setPhotos(ps => ps.filter(p => p.id !== id));
    toast('Foto borrada');
    return true;
  }, [toast]);

  const setCover = useCallback(async (id: string) => {
    const res = await fetch(`/api/photos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cover: true }) }).catch(() => null);
    toast(res?.ok ? 'Ahora es la portada del álbum' : 'No pudimos cambiar la portada.');
  }, [toast]);

  const open = useCallback((id: string) => {
    const i = ready.findIndex(p => p.id === id);
    if (i >= 0) setViewer({ start: i });
  }, [ready]);

  const others = album.people.filter(p => p.id !== me?.id).map(p => p.name.split(' ')[0]);
  // "de Juli, Tomi y vos"; si el álbum es solo tuyo no hace falta decirlo.
  const by = isPublic ? namesList(album.people.map(p => p.name.split(' ')[0]), false) : others.length ? namesList(others, !!me) : '';

  return (
    <section>
      {!isPublic && (
        <nav className="crumbs" aria-label="Navegación">
          <Link className="backlink" href="/">
            <IconBack />
            Mesa
          </Link>
        </nav>
      )}
      <header className="album-head">
        <h1 className="album-title" ref={titleRef}>
          {album.title}
        </h1>
        <div className="album-meta">
          {album.place && <span>{album.place}</span>}
          {album.coords && <span>{album.coords}</span>}
          {from && to && (
            <span aria-label={rangeText(from, to)}>
              <DateStamp date={from} className="ui-stamp" />
              {!sameDay(from, to) && (
                <>
                  &nbsp;&nbsp;al&nbsp;&nbsp;
                  <DateStamp date={to} className="ui-stamp" />
                </>
              )}
            </span>
          )}
          <span className="who">
            <Avatars people={album.people} meId={me?.id} />
            <span>
              {plural(ready.length, 'foto', 'fotos')}
              {by ? ` de ${by}` : ''}
            </span>
          </span>
        </div>
        <div className="album-actions">
          {ready.length > 0 && (
            <div className="seg" role="group" aria-label="Cómo ver el álbum" ref={seg}>
              <span className="seg-thumb" aria-hidden="true" />
              <button type="button" aria-pressed={mode === 'mesa'} onClick={() => setMode('mesa')}>
                Mesa
              </button>
              <button type="button" aria-pressed={mode === 'carrusel'} onClick={() => setMode('carrusel')}>
                Carrusel
              </button>
            </div>
          )}
          {moved && mode === 'mesa' && (
            <button className="btn ghost" type="button" onClick={() => { spread.current?.tidy(); setMoved(false); }}>
              Acomodar
            </button>
          )}
          {isOwner && (
            <button className="btn ghost" type="button" onClick={() => setSheet('share')}>
              <IconShare />
              Compartir
            </button>
          )}
          {!isPublic && (
            <button className="btn ghost" type="button" onClick={() => setSheet('settings')}>
              {isOwner ? 'Editar' : 'Álbum'}
            </button>
          )}
          {canUpload && (
            <>
              <button className="btn" type="button" onClick={() => fileInput.current?.click()}>
                <IconUpload />
                Subir fotos
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                hidden
                onChange={e => {
                  uploads.add([...(e.target.files ?? [])]);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="empty">
          <h2>{canUpload ? 'Esta mesa está vacía' : 'Todavía no hay fotos'}</h2>
          <p>{canUpload ? 'Soltá tus fotos acá o tocá Subir fotos. Se revelan solas en unos segundos.' : 'Cuando alguien suba fotos, van a aparecer acá.'}</p>
        </div>
      ) : mode === 'carrusel' && ready.length ? (
        <Carousel ref={carousel} photos={ready} title={album.title} shareToken={album.shareToken} onOpen={i => setViewer({ start: i })} />
      ) : (
        <Spread
          ref={spread}
          photos={visible}
          shareToken={album.shareToken}
          canRemove={p => canUpload && (isOwner || p.by?.id === me?.id)}
          onOpen={open}
          onRemove={p => removePhoto(p.id)}
          onMoved={() => setMoved(true)}
        />
      )}

      {viewer && ready.length > 0 && (
        <Viewer
          title={album.title}
          place={album.place}
          photos={ready}
          start={viewer.start}
          shareToken={album.shareToken}
          allowDownload={!isPublic || !!album.allowDownload}
          canNote={canUpload}
          canCover={isOwner}
          canDelete={p => isOwner || (canUpload && p.by?.id === me?.id)}
          sourceFor={sourceFor}
          onIndex={i => mode === 'carrusel' && carousel.current?.goTo(i)}
          onNote={saveNote}
          onCover={setCover}
          onDelete={removePhoto}
          onClose={() => setViewer(null)}
        />
      )}

      {sheet === 'share' && me && <ShareSheet album={album} meId={me.id} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && me && <SettingsSheet album={album} isOwner={isOwner} meId={me.id} onClose={() => setSheet(null)} />}

      {dragging && (
        <div className="drop">
          Soltá las fotos
          <br />
          sobre la mesa
        </div>
      )}
      {!isPublic && <RefreshOnFocus onRefresh={() => router.refresh()} />}
    </section>
  );
}

/** Al volver a la pestaña, trae las fotos que subieron otras personas. */
function RefreshOnFocus({ onRefresh }: { onRefresh: () => void }) {
  useEffect(() => {
    let last = Date.now();
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 30_000) {
        last = Date.now();
        onRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [onRefresh]);
  return null;
}
