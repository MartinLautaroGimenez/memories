'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fmtDate, fmtExposure, fmtTime } from '@/lib/format';
import { DateStamp } from './DateStamp';
import { IconBack, IconClose, IconDownload, IconFlip, IconMore, IconNext } from './icons';
import { cardRatio, clamp, EASE, reducedMotion, tiltRelease, tiltTo } from './motion';
import { aspect, mediaUrl, PhotoImage, type LocalPhoto } from './Print';
import { trap } from './Sheet';

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
  const [i, setI] = useState(() => clamp(props.start, 0, photos.length - 1));
  const [flipped, setFlipped] = useState(false);
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed');
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
  const idx = Math.max(0, Math.min(i, photos.length - 1));
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
    const id = photos[i]?.id;
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
    setI(next);
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
  }, [i]);

  /* Teclado */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.sheet')) return;
      const typing = (e.target as Element)?.closest?.('textarea');
      if (e.key === 'Escape') {
        e.preventDefault();
        if (menu !== 'closed') setMenu('closed');
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
  }, [nav, close, menu]);

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
  const showMenu = props.canCover || props.canDelete(p);

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
                  <dl className="specs">
                    <dt>Lugar</dt>
                    <dd>{props.place || 'Sin lugar'}</dd>
                    {p.takenAt && (
                      <>
                        <dt>Fecha</dt>
                        <dd>
                          <DateStamp date={p.takenAt} className="ui-stamp" />
                          &nbsp;&nbsp;{fmtTime(p.takenAt)}
                          <span className="sr">{fmtDate(p.takenAt)}</span>
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
                    {p.by && (
                      <>
                        <dt>Subida por</dt>
                        <dd>{p.by.name}</dd>
                      </>
                    )}
                    <dt>Archivo</dt>
                    <dd>{p.file}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="v-bottom">
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
