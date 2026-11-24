'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { plural, rangeText, sameDay } from '@/lib/format';
import { namesList } from '@/lib/people';
import type { AlbumDTO, PhotoDTO, ReactionKind } from '@/lib/types';
import { DayHead, dayGroups, MoreMenu, Reorder, SelectionBar, ShiftSheet, type ShiftScope } from './AlbumExtras';
import { AlbumMap, type AlbumMapHandle } from './AlbumMap';
import { Avatars } from './Avatars';
import { Carousel, type CarouselHandle } from './Carousel';
import { DateStamp } from './DateStamp';
import { takePendingFiles } from './handoff';
import { IconBack, IconHeart, IconProjector, IconShare, IconUpload } from './icons';
import { EASE, reducedMotion } from './motion';
import type { LocalPhoto } from './Print';
import { Projector } from './Projector';
import { SettingsSheet, ShareSheet } from './ShareSheet';
import { Sheet } from './Sheet';
import { Spread, type SpreadHandle } from './Spread';
import { useToast } from './Toast';
import { useDropFiles } from './useDropFiles';
import { useUploads } from './useUploads';
import { Viewer, type PhotoEdit } from './Viewer';

type Me = { id: string; name: string } | null;

/* Nombre del invitado guardado en este navegador */
const NAME_KEY = 'memories-guest-name';
const NAME_EVENT = 'memories-guest-name';
const readName = () => { try { return localStorage.getItem(NAME_KEY); } catch { return null; } };
const subscribeName = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(NAME_EVENT, cb);
  return () => { window.removeEventListener('storage', cb); window.removeEventListener(NAME_EVENT, cb); };
};

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
  // Invitados sin cuenta que entran por un link público con subida permitida
  const guestUpload = isPublic && !!album.allowUpload && !!album.shareToken;
  const storedName = useSyncExternalStore(subscribeName, readName, () => null);
  const guestName = guestUpload ? storedName : null;
  const setGuestName = (name: string) => {
    try { localStorage.setItem(NAME_KEY, name); } catch {}
    window.dispatchEvent(new Event(NAME_EVENT));
  };
  const [askName, setAskName] = useState<null | { files?: File[] }>(null);
  const canEditPhoto = useCallback((p: PhotoDTO) => isOwner || (canUpload && !!me && p.by?.id === me.id), [isOwner, canUpload, me]);

  const [photos, setPhotos] = useState<LocalPhoto[]>(album.photos);
  const [mode, setMode] = useState<'mesa' | 'carrusel' | 'mapa'>('mesa');
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
  const mapRef = useRef<AlbumMapHandle>(null);
  const [projector, setProjector] = useState<{ start: number } | null>(null);
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
  // El mapa aparece si el admin lo habilitó, el álbum lo muestra y alguna foto trae GPS
  const hasMap = album.mapsEnabled && album.showMap && ready.some(p => p.lat != null && p.lng != null);
  const favCount = useMemo(() => photos.filter(p => p.fav && p.status === 'ready').length, [photos]);
  const [from, to] = useMemo(() => {
    const dates = photos.filter(p => p.status === 'ready').map(p => p.takenAt).filter((d): d is string => !!d).sort();
    return dates.length ? [dates[0], dates[dates.length - 1]] : [album.from, album.to];
  }, [photos, album.from, album.to]);

  const guestApi = guestUpload ? `/api/s/${encodeURIComponent(album.shareToken!)}/photos` : undefined;
  const uploads = useUploads({
    albumId: album.id,
    me,
    setPhotos,
    initialPending: album.photos.filter(p => p.status === 'processing').map(p => p.id),
    toast,
    uploadUrl: guestApi,
    statusUrl: guestApi,
    guestName,
  });

  /** Sube fotos; si es un invitado sin nombre, primero se lo pregunta. */
  const addFiles = useCallback((files: File[]) => {
    if (guestUpload && !guestName) setAskName({ files });
    else uploads.add(files);
  }, [guestUpload, guestName, uploads]);
  const pickFiles = () => (guestUpload && !guestName ? setAskName({}) : fileInput.current?.click());

  useEffect(() => {
    const files = takePendingFiles();
    if (files?.length && canUpload) uploads.add(files);
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dragging = useDropFiles((canUpload || guestUpload) && !ordering ? addFiles : null);

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
      if (mode === 'mapa') return mapRef.current?.printFor(id) ?? null;
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
                {hasMap && (
                  <button type="button" aria-pressed={mode === 'mapa'} onClick={() => { setSelecting(false); setMode('mapa'); }}>
                    Mapa
                  </button>
                )}
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
            {ready.length > 1 && !selecting && (
              <button className="icon-btn" type="button" aria-label="Proyectar el álbum" title="Proyectar" onClick={() => setProjector({ start: 0 })}>
                <IconProjector />
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
            {(canUpload || guestUpload) && (
              <>
                <button className="btn" type="button" onClick={pickFiles}>
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
                    addFiles([...(e.target.files ?? [])]);
                    e.target.value = '';
                  }}
                />
              </>
            )}
          </div>
        )}
      </header>

      {guestUpload && (
        <p className="guest-note">
          {guestName ? `Hola ${guestName}: soltá tus fotos acá o tocá Subir fotos.` : '¿Estuviste? Subí tus fotos, no hace falta crear una cuenta.'}
        </p>
      )}

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
      ) : mode === 'mapa' && hasMap ? (
        <AlbumMap ref={mapRef} photos={ready} shareToken={album.shareToken} onOpen={open} />
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
          onProject={ready.length > 1 ? i => { setViewer(null); setProjector({ start: i }); } : undefined}
          sourceFor={sourceFor}
          onIndex={i => mode === 'carrusel' && carousel.current?.goTo(i)}
          onNote={saveNote}
          onCover={setCover}
          onDelete={removePhoto}
          onClose={() => setViewer(null)}
        />
      )}

      {projector && ready.length > 0 && (
        <Projector photos={ready} start={projector.start} title={album.title} shareToken={album.shareToken} onClose={() => setProjector(null)} />
      )}

      {sheet === 'share' && me && <ShareSheet album={album} meId={me.id} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && me && <SettingsSheet album={album} isOwner={isOwner} meId={me.id} onClose={() => setSheet(null)} />}
      {sheet === 'shift' && (
        <ShiftSheet photos={photos} selected={selecting ? sel : []} mine={isOwner ? null : me?.id ?? null} onApply={applyShift} onClose={() => setSheet(null)} />
      )}

      {askName && (
        <Sheet title="¿Cómo te llamás?" sub="Así todos saben quién subió cada foto. Lo guardamos en este celu para la próxima." onClose={() => setAskName(null)}>
          <form
            onSubmit={e => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get('guest') ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
              if (!name) return;
              setGuestName(name);
              const pending = askName.files;
              setAskName(null);
              if (pending?.length) setTimeout(() => uploads.add(pending), 0);
              else fileInput.current?.click();
            }}
          >
            <div className="field">
              <label htmlFor="guest">Tu nombre</label>
              <input className="input" id="guest" name="guest" required maxLength={40} autoComplete="given-name" />
            </div>
            <button className="btn" type="submit">{askName.files?.length ? `Subir ${plural(askName.files.length, 'foto', 'fotos')}` : 'Elegir fotos'}</button>
          </form>
        </Sheet>
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
