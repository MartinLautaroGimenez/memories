'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fmtDate, fmtExposure, fmtTime } from '@/lib/format';
import { DateStamp } from './DateStamp';
import { IconBack, IconClose, IconDownload, IconFlip, IconHeart, IconMore, IconNext, IconProjector } from './icons';
import { cardRatio, clamp, EASE, reducedMotion, tiltRelease, tiltTo } from './motion';
import { aspect, mediaUrl, PhotoImage, type LocalPhoto } from './Print';
import { trap } from './Sheet';
import { BackPeople, WhoSheet } from './People';
import { CommentsButton, CommentsPanel, Reactions } from './Social';
import type { ReactionKind } from '@/lib/types';

export type PhotoEdit = { takenAt?: string; place?: string | null; camera?: string | null; resetDate?: true };

type Props = {
  title: string;
  place: string;
  photos: LocalPhoto[];
  start: number;
  shareToken?: string;
  allowDownload: boolean;
  canNote: boolean;
  canCover: boolean;
  canDelete: (p: LocalPhoto) => boolean;
  /** Puede editar fecha, lugar, cámara y girar (quien administra o quien la subió). */
  canEdit?: (p: LocalPhoto) => boolean;
  onFav?: (id: string, on: boolean) => void;
  onRotate?: (id: string, deg: 90 | -90) => void;
  onSaveData?: (id: string, data: PhotoEdit) => Promise<boolean>;
  /** Reacciones y comentarios (solo para miembros del álbum). */
  onReact?: (id: string, kind: ReactionKind, on: boolean) => void;
  onCommentsCount?: (id: string, n: number) => void;
  /** Abre el modo proyector desde la foto en pantalla. */
  onProject?: (i: number) => void;
  /** Quién aparece (solo miembros del álbum). */
  people?: { canEdit: boolean; onChanged: () => void };
  sourceFor: (id: string) => HTMLElement | null;
  onIndex?: (i: number) => void;
  onNote: (id: string, note: string) => void;
  onCover: (id: string) => void;
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
};

/** El visor: la copia se levanta de la mesa, se puede dar vuelta y ver su dorso. */
export function Viewer(props: Props) {
  const { photos, title, shareToken } = props;
  // Se sigue a la foto por su id: si el álbum se reordena (por ejemplo al corregir la fecha), no se pierde.
  const [cur, setCur] = useState(() => {
    const i = clamp(props.start, 0, photos.length - 1);
    return { id: photos[i]?.id, i };
  });
  const [flipped, setFlipped] = useState(false);
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed');
  const [talk, setTalk] = useState(false);
  const [who, setWho] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hiRes, setHiRes] = useState<{ id: string; url: string } | null>(null);

  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const vpos = useRef<HTMLDivElement>(null);
  const vtilt = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLElement | null>(null);
  const enter = useRef<number>(0); // dirección de entrada tras navegar
  const busy = useRef(false);
  const closing = useRef(false);
  const back = useRef<Element | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const propsRef = useRef(props);
  const navRef = useRef<(dir: number, fromX?: number) => void>(() => {});
  const closeRef = useRef<() => void>(() => {});
  useEffect(() => { propsRef.current = props; });

  // Si se borró la última foto mientras se miraba, se queda con la anterior.
  const found = photos.findIndex(p => p.id === cur.id);
  const idx = found >= 0 ? found : Math.max(0, Math.min(cur.i, photos.length - 1));
  const p = photos[idx];
  const ar = p ? aspect(p) : 1.5;
  const k = cardRatio(ar);

  /* Tamaño de la copia según el lugar disponible */
  const layout = useCallback(() => {
    const s = stage.current?.getBoundingClientRect();
    if (!s) return;
    let w = Math.min(s.width - 32, 1180), h = w / k;
    const maxH = Math.max(160, s.height - 20);
    if (h > maxH) { h = maxH; w = h * k; }
    setBox({ w, h });
  }, [k]);
  useLayoutEffect(layout, [layout]);
  useEffect(() => {
    window.addEventListener('resize', layout);
    return () => window.removeEventListener('resize', layout);
  }, [layout]);

  /* Oculta la copia de la mesa mientras está "levantada" */
  const hideSource = useCallback((id: string | undefined) => {
    if (hidden.current) hidden.current.style.visibility = '';
    hidden.current = id ? propsRef.current.sourceFor(id) : null;
    if (hidden.current) hidden.current.style.visibility = 'hidden';
  }, []);

  const flipFrom = (el: HTMLElement | null, reverse = false) => {
    const card = vpos.current;
    if (!card) return null;
    const t = card.getBoundingClientRect();
    const s = el?.getBoundingClientRect();
    if (!el || !s || s.bottom < 0 || s.top > window.innerHeight) {
      return reverse ? card.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.94)' }], { duration: 260, fill: 'forwards' }) : null;
    }
    const rot = parseFloat(/rotate\(([-\d.]+)deg\)/.exec(el.style.transform)?.[1] ?? el.style.getPropertyValue('--r0')) || 0;
    const from = `translate(${s.left + s.width / 2 - (t.left + t.width / 2)}px,${s.top + s.height / 2 - (t.top + t.height / 2)}px) rotate(${rot}deg) scale(${el.offsetWidth / t.width})`;
    const frames = [{ transform: from }, { transform: 'none' }];
    return card.animate(reverse ? frames.reverse() : frames, { duration: reverse ? 460 : 620, easing: EASE, fill: reverse ? 'forwards' : 'none' });
  };

  /* Apertura */
  useLayoutEffect(() => {
    back.current = document.activeElement;
    document.documentElement.style.overflow = 'hidden';
    const id = photos[idx]?.id;
    const src = id ? propsRef.current.sourceFor(id) : null;
    if (!reducedMotion()) {
      flipFrom(src);
      root.current?.querySelector('.v-scrim')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
      root.current?.querySelectorAll('.v-top,.v-bottom').forEach(el => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 220, fill: 'backwards' }));
    }
    hideSource(id);
    root.current?.querySelector<HTMLElement>('#vClose')?.focus({ preventScroll: true });
    return () => {
      document.documentElement.style.overflow = '';
      hideSource(undefined);
      (back.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    clearTimeout(noteTimer.current);
    if (!reducedMotion()) {
      const fade = [...(root.current?.querySelectorAll('.v-scrim,.v-top,.v-bottom') ?? [])].map(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
      const a = flipFrom(hidden.current, true);
      await a?.finished.catch(() => {});
      fade.forEach(f => f.cancel());
    }
    propsRef.current.onClose();
  }, []);

  /* Imagen grande cuando termina de bajar */
  useEffect(() => {
    if (!p) return;
    const url = mediaUrl(p.id, 'display', shareToken);
    const im = new Image();
    im.src = url;
    let alive = true;
    im.decode().then(() => alive && setHiRes({ id: p.id, url })).catch(() => {});
    return () => { alive = false; };
  }, [p, shareToken]);
  const hi = hiRes && p && hiRes.id === p.id ? hiRes.url : null;

  /* Navegación con animación de salida y entrada */
  const nav = useCallback(async (dir: number, fromX = 0) => {
    if (busy.current || photos.length < 2) return;
    busy.current = true;
    setMenu('closed');
    const next = (idx + dir + photos.length) % photos.length;
    if (!reducedMotion() && vpos.current) {
      const out = vpos.current.animate(
        [
          { transform: `translateX(${fromX}px) rotate(${fromX * 0.015}deg)`, opacity: 1 },
          { transform: `translateX(${-dir * 55}vw) rotate(${-dir * 8}deg)`, opacity: 0 },
        ],
        { duration: 240, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
      );
      await out.finished.catch(() => {});
      enter.current = dir;
      requestAnimationFrame(() => out.cancel());
    }
    setFlipped(false);
    setCur({ id: photos[next].id, i: next });
    propsRef.current.onIndex?.(next);
    hideSource(photos[next]?.id);
    if (!enter.current) busy.current = false;
  }, [idx, photos, hideSource]);

  // Entrada de la foto nueva (la tarjeta se monta de nuevo por su `key`, sin girar)
  useLayoutEffect(() => {
    const dir = enter.current;
    if (!dir || !vpos.current) return;
    enter.current = 0;
    vpos.current
      .animate([{ transform: `translateX(${dir * 40}vw) rotate(${dir * 7}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: EASE })
      .finished.finally(() => { busy.current = false; });
  }, [cur.id]);

  /* Teclado */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.sheet')) return;
      // Una hoja abierta encima (por ejemplo, "¿Quién aparece?") maneja su propio teclado
      if ((e.target as Element)?.closest?.('.sheet')) return;
      const typing = (e.target as Element)?.closest?.('textarea,input,select');
      if (e.key === 'Escape') {
        e.preventDefault();
        if (talk) setTalk(false);
        else if (menu !== 'closed') setMenu('closed');
        else if (typing) (e.target as HTMLElement).blur();
        else close();
      } else if (e.key === 'Tab' && root.current) trap(e, root.current);
      else if (typing) return;
      else if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setFlipped(f => !f); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, close, menu, talk]);

  /* Deslizar para cambiar de foto; inclinar con el mouse */
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let sw: { x: number; y: number; id: number; moved: boolean; dx: number; onCard: boolean } | null = null;
    const hover = (e: PointerEvent) => {
      if (!sw && e.pointerType === 'mouse' && vtilt.current) tiltTo(el, vtilt.current, e, 6);
    };
    const leave = () => tiltRelease(vtilt.current);
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('textarea,button,a') || e.button > 0) return;
      sw = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, dx: 0, onCard: !!(e.target as Element).closest('.vpos') };
    };
    const move = (e: PointerEvent) => {
      if (!sw || e.pointerId !== sw.id || busy.current || !vpos.current) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if (!sw.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { sw.moved = true; tiltRelease(vtilt.current); }
      if (sw.moved) { sw.dx = dx; vpos.current.style.transform = `translateX(${dx}px) rotate(${dx * 0.015}deg)`; }
    };
    const up = (e: PointerEvent) => {
      if (!sw || e.pointerId !== sw.id) return;
      const s = sw;
      sw = null;
      const card = vpos.current;
      if (s.moved && card) {
        const from = card.style.transform;
        card.style.transform = '';
        if (Math.abs(s.dx) > 70) navRef.current(s.dx < 0 ? 1 : -1, s.dx);
        else if (!reducedMotion()) card.animate([{ transform: from }, { transform: 'none' }], { duration: 380, easing: EASE });
      } else if (!s.onCard && e.type === 'pointerup' && e.target === el) closeRef.current();
    };
    el.addEventListener('pointermove', hover);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointermove', hover);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  useEffect(() => { navRef.current = nav; closeRef.current = close; });

  if (!p) return null;

  const fsH = clamp(box.w * 0.062, 20, 46), fsS = clamp(box.w * 0.027, 12, 16);
  const exposure = fmtExposure(p.exposure);
  const canEdit = !!props.canEdit?.(p);
  const showMenu = props.canCover || props.canDelete(p) || (canEdit && !!props.onRotate);

  function onNoteChange(v: string) {
    propsRef.current.onNote(p.id, v);
  }

  return (
    <div className="viewer" ref={root} role="dialog" aria-modal="true" aria-label={`${title}, foto ${idx + 1} de ${photos.length}`}>
      <div className="v-scrim" onClick={close} />
      <div className="v-top">
        <p className="v-title">
          {title} <span>{idx + 1} de {photos.length}</span>
        </p>
        {props.onFav && (
          <button className={`icon-btn fav-btn${p.fav ? ' on' : ''}`} type="button" aria-pressed={p.fav} aria-label={p.fav ? 'Sacar de favoritas' : 'Marcar como favorita'} onClick={() => props.onFav!(p.id, !p.fav)}>
            <IconHeart filled={p.fav} />
          </button>
        )}
        {props.onProject && (
          <button className="icon-btn" type="button" aria-label="Proyectar desde esta foto" title="Proyectar" onClick={() => props.onProject!(idx)}>
            <IconProjector />
          </button>
        )}
        {props.allowDownload && (
          <a className="icon-btn" href={`${mediaUrl(p.id, 'original', shareToken)}${shareToken ? '&' : '?'}download`} aria-label={`Descargar el original (${p.file})`} download>
            <IconDownload />
          </a>
        )}
        {showMenu && (
          <div className="menu-wrap">
            <button className="icon-btn" type="button" aria-label="Más opciones" aria-haspopup="true" aria-expanded={menu !== 'closed'} onClick={() => setMenu(m => (m === 'closed' ? 'open' : 'closed'))}>
              <IconMore />
            </button>
            {menu !== 'closed' && (
              <div className="menu v-menu" role="menu">
                {menu === 'open' ? (
                  <div className="row">
                    {canEdit && props.onRotate && (
                      <>
                        <button className="btn ghost" type="button" role="menuitem" onClick={() => { props.onRotate!(p.id, -90); setMenu('closed'); }}>
                          Girar a la izquierda
                        </button>
                        <button className="btn ghost" type="button" role="menuitem" onClick={() => { props.onRotate!(p.id, 90); setMenu('closed'); }}>
                          Girar a la derecha
                        </button>
                      </>
                    )}
                    {props.canCover && (
                      <button className="btn ghost" type="button" role="menuitem" onClick={() => { props.onCover(p.id); setMenu('closed'); }}>
                        Usar de portada
                      </button>
                    )}
                    {props.canDelete(p) && (
                      <button className="btn ghost" type="button" role="menuitem" onClick={() => setMenu('confirm')}>
                        Borrar foto
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="row">
                    <p className="mail" style={{ marginBottom: 4 }}>Se borra para todas las personas del álbum.</p>
                    <button className="btn danger" type="button" onClick={async () => { const ok = await props.onDelete(p.id); setMenu('closed'); if (ok) setFlipped(false); }}>
                      Borrar foto
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setMenu('closed')}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <button className="icon-btn" id="vClose" type="button" aria-label="Cerrar" onClick={close}>
          <IconClose />
        </button>
      </div>

      <div className="v-stage" ref={stage}>
        <div className="vpos" ref={vpos} style={{ width: box.w, height: box.h, ['--fs-h' as string]: `${fsH}px`, ['--fs-s' as string]: `${fsS}px` }}>
          <div className="vtilt" ref={vtilt}>
            <div key={p.id} className={`vcard${flipped ? ' flipped' : ''}`}>
              <div className="face front" aria-hidden={flipped}>
                <div className="paper">
                  <FrontImage photo={p} hiRes={hi} shareToken={shareToken} />
                  <span className="gloss" />
                </div>
              </div>
              <div className="face back" aria-hidden={!flipped}>
                <div className={`back-paper${k > 1.15 ? ' wide' : ''}`}>
                  <div className="wm" />
                  <div className="note">
                    <label htmlFor="noteField">Escrito atrás</label>
                    <textarea
                      key={p.id}
                      id="noteField"
                      rows={3}
                      defaultValue={p.note}
                      readOnly={!props.canNote}
                      placeholder={props.canNote ? 'Escribí algo atrás de la foto' : 'Nadie escribió nada atrás de esta foto.'}
                      spellCheck={false}
                      maxLength={600}
                      tabIndex={flipped ? 0 : -1}
                      onChange={e => onNoteChange(e.target.value)}
                    />
                  </div>
                  <BackData
                    key={p.id}
                    p={p}
                    albumPlace={props.place}
                    exposure={exposure}
                    canEdit={canEdit && !!props.onSaveData}
                    onSave={props.onSaveData}
                    tab={flipped ? 0 : -1}
                    people={props.people && <BackPeople photoId={p.id} active={flipped} canEdit={props.people.canEdit} onEdit={() => setWho(true)} tab={flipped ? 0 : -1} />}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="v-bottom">
        {props.onReact && (
          <div className="v-social">
            <Reactions p={p} onReact={(kind, on) => props.onReact!(p.id, kind, on)} />
            <CommentsButton n={p.comments} open={talk} onClick={() => setTalk(t => !t)} />
          </div>
        )}
        <div className="v-nav">
          <button className="icon-btn" type="button" aria-label="Foto anterior" onClick={() => nav(-1)} disabled={photos.length < 2}>
            <IconBack />
          </button>
          <button className="btn ghost v-flip" type="button" aria-pressed={flipped} onClick={() => setFlipped(f => !f)}>
            <IconFlip />
            {flipped ? 'Ver foto' : 'Dar vuelta'}
          </button>
          <button className="icon-btn" type="button" aria-label="Foto siguiente" onClick={() => nav(1)} disabled={photos.length < 2}>
            <IconNext />
          </button>
        </div>
      </div>
      {who && props.people && <WhoSheet photoId={p.id} onClose={() => setWho(false)} onChanged={props.people.onChanged} />}
      {talk && props.onReact && (
        <CommentsPanel key={p.id} photoId={p.id} onCount={n => props.onCommentsCount?.(p.id, n)} onClose={() => setTalk(false)} />
      )}
    </div>
  );
}

function FrontImage({ photo, hiRes, shareToken }: { photo: LocalPhoto; hiRes: string | null; shareToken?: string }) {
  if (!hiRes) return <PhotoImage photo={photo} shareToken={shareToken} eager stamp />;
  return (
    <div className="photo" style={{ ['--ar' as string]: aspect(photo), ['--c' as string]: photo.color ?? '#888' }}>
      <img src={hiRes} alt={photo.note || 'Foto'} decoding="async" draggable={false} />
      {photo.takenAt && <DateStamp date={photo.takenAt} />}
    </div>
  );
}

/** Ficha técnica del dorso. Quien puede editar la corrige ahí mismo. */
function BackData({ p, albumPlace, exposure, canEdit, onSave, tab, people }: {
  p: LocalPhoto; albumPlace: string; exposure: string; canEdit: boolean; onSave?: (id: string, data: PhotoEdit) => Promise<boolean>; tab: number; people?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const changed = !!p.exifTakenAt && !!p.takenAt && p.exifTakenAt !== p.takenAt;

  if (editing && onSave) {
    return (
      <form
        className="specs-edit"
        onSubmit={async e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const date = String(fd.get('date') ?? ''), time = String(fd.get('time') ?? '') || '12:00';
          setBusy(true);
          const ok = await onSave(p.id, {
            ...(date ? { takenAt: `${date}T${time}` } : {}),
            place: String(fd.get('place') ?? '').trim() || null,
            camera: String(fd.get('camera') ?? '').trim() || null,
          });
          setBusy(false);
          if (ok) setEditing(false);
        }}
      >
        <div className="row2">
          <label>Fecha<input className="input" name="date" type="date" defaultValue={p.takenAt?.slice(0, 10)} tabIndex={tab} /></label>
          <label>Hora<input className="input" name="time" type="time" defaultValue={p.takenAt?.slice(11, 16)} tabIndex={tab} /></label>
        </div>
        <label>Lugar<input className="input" name="place" defaultValue={p.place ?? ''} placeholder={albumPlace || 'Dónde fue'} maxLength={160} tabIndex={tab} /></label>
        <label>Cámara<input className="input" name="camera" defaultValue={p.camera ?? ''} maxLength={120} tabIndex={tab} /></label>
        <div className="form-actions">
          <button className="btn" type="submit" disabled={busy} tabIndex={tab}>Guardar</button>
          <button className="btn ghost" type="button" onClick={() => setEditing(false)} tabIndex={tab}>Cancelar</button>
        </div>
        {changed && (
          <button className="link-btn" type="button" tabIndex={tab} onClick={async () => { setBusy(true); if (await onSave(p.id, { resetDate: true })) setEditing(false); setBusy(false); }}>
            Volver a la fecha de la cámara ({fmtDate(p.exifTakenAt!)}, {fmtTime(p.exifTakenAt!)})
          </button>
        )}
      </form>
    );
  }

  return (
    <dl className="specs">
      <dt>Lugar</dt>
      <dd>{p.place || albumPlace || 'Sin lugar'}</dd>
      {people && (
        <>
          <dt>Aparecen</dt>
          <dd>{people}</dd>
        </>
      )}
      {p.takenAt && (
        <>
          <dt>Fecha</dt>
          <dd>
            <DateStamp date={p.takenAt} className="ui-stamp" />
            &nbsp;&nbsp;{fmtTime(p.takenAt)}
            <span className="sr">{fmtDate(p.takenAt)}</span>
            {changed && <span className="edited"> (corregida)</span>}
          </dd>
        </>
      )}
      <dt>Cámara</dt>
      <dd>{p.camera ?? 'Sin datos de cámara'}</dd>
      {exposure && (
        <>
          <dt>Exposición</dt>
          <dd>{exposure}</dd>
        </>
      )}
      {(p.by || p.guestName) && (
        <>
          <dt>Subida por</dt>
          <dd>{p.by?.name ?? `${p.guestName} (sin cuenta)`}</dd>
        </>
      )}
      <dt>Archivo</dt>
      <dd>{p.file}</dd>
      {canEdit && (
        <dd className="edit-row">
          <button className="link-btn" type="button" tabIndex={tab} onClick={() => setEditing(true)}>Corregir fecha, lugar o cámara</button>
        </dd>
      )}
    </dl>
  );
}
