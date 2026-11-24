'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { plural, rangeText, sameDay } from '@/lib/format';
import { namesList } from '@/lib/people';
import type { AlbumDTO, PhotoDTO, ReactionKind } from '@/lib/types';
import { DayHead, dayGroups, MoreMenu, Reorder, SelectionBar, ShiftSheet, type ShiftScope } from './AlbumExtras';
import { Avatars } from './Avatars';
import { Carousel, type CarouselHandle } from './Carousel';
import { DateStamp } from './DateStamp';
import { takePendingFiles } from './handoff';
import { IconBack, IconHeart, IconShare, IconUpload } from './icons';
import { EASE, reducedMotion } from './motion';
import type { LocalPhoto } from './Print';
import { SettingsSheet, ShareSheet } from './ShareSheet';
import { Spread, type SpreadHandle } from './Spread';
import { useToast } from './Toast';
import { useDropFiles } from './useDropFiles';
import { useUploads } from './useUploads';
import { Viewer, type PhotoEdit } from './Viewer';

type Me = { id: string; name: string } | null;

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = await res?.json().catch(() => null);
  return { ok: !!res?.ok, data };
}

/** Orden por fecha (hora de reloj); lo que todavía no tiene fecha va primero. */
function byDate(a: LocalPhoto, b: LocalPhoto) {
  if (!a.takenAt || !b.takenAt) return (a.takenAt ? 1 : 0) - (b.takenAt ? 1 : 0);
  return a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0;
}

/** `openPhoto`: id de una foto para abrir de entrada (links con ?foto=, por ejemplo desde un aviso por mail). */
export function AlbumView({ album, me, openPhoto }: { album: AlbumDTO; me: Me; openPhoto?: string }) {
  const router = useRouter();
  const toast = useToast();
  const isPublic = album.role === 'public';
  const canUpload = album.role === 'owner' || album.role === 'contributor';
  const isOwner = album.role === 'owner';
  const canEditPhoto = useCallback((p: PhotoDTO) => isOwner || (canUpload && !!me && p.by?.id === me.id), [isOwner, canUpload, me]);

  const [photos, setPhotos] = useState<LocalPhoto[]>(album.photos);
  const [mode, setMode] = useState<'mesa' | 'carrusel'>('mesa');
  const [viewer, setViewer] = useState<{ start: number } | null>(() => {
    const i = openPhoto ? album.photos.filter(p => p.status === 'ready').findIndex(p => p.id === openPhoto) : -1;
    return i >= 0 ? { start: i } : null;
  });
  const [sheet, setSheet] = useState<'share' | 'settings' | 'shift' | null>(null);
  const [moved, setMoved] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ordering, setOrdering] = useState(false);
  const [sortMode, setSortMode] = useState(album.sortMode);
  const [dayNotes, setDayNotes] = useState(album.dayNotes);
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

  const ordered = useMemo(() => (sortMode === 'date' ? [...photos].sort(byDate) : photos), [photos, sortMode]);
  const visible = useMemo(
    () => ordered.filter(p => (p.status !== 'failed' || isOwner || p.by?.id === me?.id || p.id.startsWith('local-')) && (!onlyFav || (p.status === 'ready' && p.fav))),
    [ordered, isOwner, me?.id, onlyFav],
  );
  const ready = useMemo(() => visible.filter(p => p.status === 'ready'), [visible]);
  const favCount = useMemo(() => photos.filter(p => p.fav && p.status === 'ready').length, [photos]);
  const [from, to] = useMemo(() => {
    const dates = photos.filter(p => p.status === 'ready').map(p => p.takenAt).filter((d): d is string => !!d).sort();
    return dates.length ? [dates[0], dates[dates.length - 1]] : [album.from, album.to];
  }, [photos, album.from, album.to]);

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

  const dragging = useDropFiles(canUpload && !ordering ? uploads.add : null);

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

  /* ---------- Acciones sobre fotos ---------- */

  const saveNote = useCallback((id: string, note: string) => {
    setPhotos(ps => ps.map(p => (p.id === id ? { ...p, note } : p)));
    const timers = noteTimers.current;
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(async () => {
        timers.delete(id);
        const r = await api(`/api/photos/${id}`, 'PATCH', { note });
        if (!r.ok) toast('No pudimos guardar la nota. Revisá tu conexión.');
      }, 700),
    );
  }, [toast]);

  const replace = (dto: PhotoDTO) => setPhotos(ps => ps.map(p => (p.id === dto.id ? { ...dto, local: p.local } : p)));

  const toggleFav = useCallback(async (id: string, on: boolean) => {
    setPhotos(ps => ps.map(p => (p.id === id ? { ...p, fav: on } : p)));
    const r = await api(`/api/photos/${id}`, 'PATCH', { fav: on });
    if (!r.ok) {
      setPhotos(ps => ps.map(p => (p.id === id ? { ...p, fav: !on } : p)));
      toast('No pudimos guardar la favorita.');
    }
  }, [toast]);

  const saveData = useCallback(async (id: string, data: PhotoEdit) => {
    const r = await api(`/api/photos/${id}`, 'PATCH', data);
    if (!r.ok) {
      toast(r.data?.error ?? 'No pudimos guardar los cambios.');
      return false;
    }
    replace(r.data.photo);
    toast(data.resetDate ? 'Volvió a la fecha de la cámara' : 'Cambios guardados');
    return true;
  }, [toast]);

  const rotate = useCallback(async (id: string, deg: 90 | -90) => {
    const r = await api(`/api/photos/${id}`, 'PATCH', { rotate: deg });
    if (!r.ok) return toast(r.data?.error ?? 'No pudimos girar la foto.');
    setViewer(null);
    replace(r.data.photo);
    uploads.watch(id);
    toast('Girando la foto');
  }, [toast, uploads]);

  const react = useCallback(async (id: string, kind: ReactionKind, on: boolean) => {
    setPhotos(ps => ps.map(p => (p.id === id ? {
      ...p,
      reactions: { ...p.reactions, [kind]: Math.max(0, (p.reactions[kind] ?? 0) + (on ? 1 : -1)) },
      myReactions: on ? [...p.myReactions, kind] : p.myReactions.filter(k => k !== kind),
    } : p)));
    const r = await api(`/api/photos/${id}/reactions`, 'POST', { kind, on });
    if (r.ok) setPhotos(ps => ps.map(p => (p.id === id ? { ...p, reactions: r.data.reactions, myReactions: r.data.myReactions } : p)));
    else toast('No pudimos guardar la reacción.');
  }, [toast]);

  const setCommentsCount = useCallback((id: string, n: number) => {
    setPhotos(ps => ps.map(p => (p.id === id && p.comments !== n ? { ...p, comments: n } : p)));
  }, []);


  const removePhoto = useCallback(async (id: string) => {
    if (id.startsWith('local-')) {
      setPhotos(ps => ps.filter(p => p.id !== id));
      return true;
    }
    const r = await api(`/api/photos/${id}`, 'DELETE');
    if (!r.ok) {
      toast(r.data?.error ?? 'No pudimos borrar la foto. Probá de nuevo.');
      return false;
    }
    setPhotos(ps => ps.filter(p => p.id !== id));
    toast('Foto borrada');
    return true;
  }, [toast]);

  const setCover = useCallback(async (id: string) => {
    const r = await api(`/api/photos/${id}`, 'PATCH', { cover: true });
    toast(r.ok ? 'Ahora es la portada del álbum' : 'No pudimos cambiar la portada.');
  }, [toast]);

  const batch = useCallback(async (body: Record<string, unknown>) => {
    const r = await api(`/api/albums/${album.id}/photos/batch`, 'POST', body);
    if (!r.ok) toast(r.data?.error ?? 'No pudimos hacer el cambio. Probá de nuevo.');
    return r;
  }, [album.id, toast]);

  const applyShift = useCallback(async (scope: ShiftScope, minutes: number | 'reset') => {
    const r = await batch(minutes === 'reset' ? { action: 'reset', scope } : { action: 'shift', minutes, scope });
    if (!r.ok) return false;
    const dates = new Map<string, string | null>((r.data.photos as { id: string; takenAt: string | null }[]).map(p => [p.id, p.takenAt]));
    setPhotos(ps => ps.map(p => (dates.has(p.id) ? { ...p, takenAt: dates.get(p.id)! } : p)));
    toast(minutes === 'reset' ? `${plural(r.data.count, 'foto volvió', 'fotos volvieron')} a la hora de la cámara` : `${plural(r.data.count, 'foto corregida', 'fotos corregidas')}`);
    return true;
  }, [batch, toast]);

  const sel = [...selected];

  async function deleteSelected() {
    const r = await batch({ action: 'delete', scope: { ids: sel } });
    if (!r.ok) return;
    const gone = new Set<string>(r.data.ids);
    setPhotos(ps => ps.filter(p => !gone.has(p.id)));
    setSelected(new Set());
    toast(plural(r.data.count, 'foto borrada', 'fotos borradas'));
  }

  async function favSelected() {
    const on = !sel.every(id => photos.find(p => p.id === id)?.fav);
    const r = await batch({ action: 'fav', on, scope: { ids: sel } });
    if (!r.ok) return;
    setPhotos(ps => ps.map(p => (selected.has(p.id) ? { ...p, fav: on } : p)));
    toast(on ? 'Marcadas como favoritas' : 'Sacadas de favoritas');
  }

  async function saveOrder(ids: string[]) {
    const r = await api(`/api/albums/${album.id}`, 'PATCH', { order: ids });
    if (!r.ok) return toast(r.data?.error ?? 'No pudimos guardar el orden.');
    const pos = new Map(ids.map((id, i) => [id, i]));
    setPhotos(ps => [...ps].sort((a, b) => (pos.get(a.id) ?? -1) - (pos.get(b.id) ?? -1)));
    setSortMode('manual');
    setOrdering(false);
    toast('Orden guardado');
  }

  async function sortByDate() {
    const r = await api(`/api/albums/${album.id}`, 'PATCH', { sortMode: 'date' });
    if (!r.ok) return toast('No pudimos cambiar el orden.');
    setSortMode('date');
    toast('Ahora se ordena por fecha');
  }

  async function saveDayNote(date: string, note: string) {
    setDayNotes(d => ({ ...d, [date]: note }));
    const r = await api(`/api/albums/${album.id}`, 'PATCH', { day: { date, note } });
    if (!r.ok) toast('No pudimos guardar el título del día.');
  }

  const open = useCallback((id: string) => {
    const i = ready.findIndex(p => p.id === id);
    if (i >= 0) setViewer({ start: i });
  }, [ready]);

  const toggleSel = useCallback((id: string) => {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const heads = useMemo(() => {
    if (sortMode !== 'date' || onlyFav) return undefined;
    const groups = dayGroups(visible);
    if (!groups) return undefined;
    return new Map(groups.map(g => [g.id, <DayHead key={`day-${g.date}`} n={g.n} date={g.date} note={dayNotes[g.date] ?? ''} canEdit={isOwner} onSave={n => saveDayNote(g.date, n)} />]));
    // saveDayNote cambia en cada render y no afecta el resultado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sortMode, onlyFav, dayNotes, isOwner]);

  const zipBase = isPublic ? (album.allowDownload && album.shareToken ? `/api/s/${encodeURIComponent(album.shareToken)}/zip` : null) : `/api/albums/${album.id}/zip`;

  const others = album.people.filter(p => p.id !== me?.id).map(p => p.name.split(' ')[0]);
  // "de Juli, Tomi y vos"; si el álbum es solo tuyo no hace falta decirlo.
  const by = isPublic ? namesList(album.people.map(p => p.name.split(' ')[0]), false) : others.length ? namesList(others, !!me) : '';

  return (
    <section className={selecting ? 'with-selbar' : undefined}>
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
              {plural(photos.filter(p => p.status === 'ready').length, 'foto', 'fotos')}
              {by ? ` de ${by}` : ''}
            </span>
          </span>
        </div>
        {!ordering && (
          <div className="album-actions">
            {ready.length > 0 && (
              <div className="seg" role="group" aria-label="Cómo ver el álbum" ref={seg}>
                <span className="seg-thumb" aria-hidden="true" />
                <button type="button" aria-pressed={mode === 'mesa'} onClick={() => setMode('mesa')}>
                  Mesa
                </button>
                <button type="button" aria-pressed={mode === 'carrusel'} onClick={() => { setSelecting(false); setMode('carrusel'); }}>
                  Carrusel
                </button>
              </div>
            )}
            {me && (favCount > 0 || onlyFav) && (
              <button className={`btn ghost fav-filter${onlyFav ? ' on' : ''}`} type="button" aria-pressed={onlyFav} onClick={() => setOnlyFav(f => !f)}>
                <IconHeart filled={onlyFav} />
                Favoritas {favCount}
              </button>
            )}
            {moved && mode === 'mesa' && !selecting && (
              <button className="btn ghost" type="button" onClick={() => { spread.current?.tidy(); setMoved(false); }}>
                Acomodar
              </button>
            )}
            {me && ready.length > 0 && !selecting && (
              <button className="btn ghost" type="button" onClick={() => { setMode('mesa'); setSelecting(true); }}>
                Seleccionar
              </button>
            )}
            {isOwner && (
              <button className="btn ghost" type="button" onClick={() => setSheet('share')}>
                <IconShare />
                Compartir
              </button>
            )}
            <MoreMenu
              items={[
                { label: 'Corregir la hora', onClick: () => setSheet('shift'), hidden: !canUpload || !ready.length },
                { label: 'Ordenar a mano', onClick: () => { setSelecting(false); setMode('mesa'); setOrdering(true); }, hidden: !isOwner || ready.length < 2 },
                { label: 'Ordenar por fecha', onClick: sortByDate, hidden: !isOwner || sortMode !== 'manual' },
                { label: 'Descargar el álbum', onClick: () => { window.location.href = zipBase!; }, hidden: !zipBase || !ready.length },
                { label: isOwner ? 'Editar álbum' : 'Salir del álbum', onClick: () => setSheet('settings'), hidden: isPublic },
              ]}
            />
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
        )}
      </header>

      {ordering ? (
        <Reorder photos={ordered.filter(p => p.status === 'ready')} shareToken={album.shareToken} onSave={saveOrder} onCancel={() => setOrdering(false)} />
      ) : visible.length === 0 ? (
        <div className="empty">
          <h2>{onlyFav ? 'Todavía no hay favoritas' : canUpload ? 'Esta mesa está vacía' : 'Todavía no hay fotos'}</h2>
          <p>
            {onlyFav
              ? 'Abrí una foto y tocá el corazón para marcarla.'
              : canUpload
                ? 'Soltá tus fotos acá o tocá Subir fotos. Se revelan solas en unos segundos.'
                : 'Cuando alguien suba fotos, van a aparecer acá.'}
          </p>
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
          selecting={selecting}
          selected={selected}
          onToggle={toggleSel}
          heads={heads}
          showFav={!!me}
        />
      )}

      {selecting && (
        <SelectionBar
          count={selected.size}
          total={ready.length}
          zipHref={zipBase && selected.size ? `${zipBase}${zipBase.includes('?') ? '&' : '?'}ids=${sel.join(',')}` : zipBase ? '#' : null}
          canFav={!!me}
          canEdit={canUpload}
          canDelete={canUpload}
          onAll={() => setSelected(new Set(ready.map(p => p.id)))}
          onNone={() => setSelected(new Set())}
          onFav={favSelected}
          onShift={() => setSheet('shift')}
          onDelete={deleteSelected}
          onDone={() => { setSelecting(false); setSelected(new Set()); }}
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
          canEdit={canEditPhoto}
          onFav={me ? toggleFav : undefined}
          onRotate={canUpload ? rotate : undefined}
          onSaveData={canUpload ? saveData : undefined}
          onReact={me && !isPublic ? react : undefined}
          onCommentsCount={setCommentsCount}
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
      {sheet === 'shift' && (
        <ShiftSheet photos={photos} selected={selecting ? sel : []} mine={isOwner ? null : me?.id ?? null} onApply={applyShift} onClose={() => setSheet(null)} />
      )}

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
