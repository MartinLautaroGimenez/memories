'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fmtDate } from '@/lib/format';
import { DateStamp } from './DateStamp';
import { IconBack, IconClose, IconExpand, IconNext, IconPause, IconPlay, IconShrink, IconShuffle } from './icons';
import { EASE, reducedMotion } from './motion';
import { mediaUrl, type LocalPhoto } from './Print';
import { trap } from './Sheet';

const SPEEDS = [
  { ms: 4000, label: '4 s' },
  { ms: 7000, label: '7 s' },
  { ms: 12000, label: '12 s' },
];
const IDLE = 2800;

/** Espera a que la próxima diapositiva esté decodificada (como mucho unos segundos). */
function preload(url: string) {
  const img = new Image();
  img.src = url;
  return Promise.race([img.decode().catch(() => undefined), new Promise(r => setTimeout(r, 4000))]);
}

function shuffled(n: number, first: number) {
  const rest = [...Array(n).keys()].filter(i => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest];
}

type Dir = 1 | -1;

/** Una diapositiva. Entra desde el costado (como el carro de un proyector) o se va hacia el otro. */
function Slide({ p, shareToken, dir, leaving, hold, onGone }: { p: LocalPhoto; shareToken?: string; dir: Dir; leaving?: boolean; hold: number; onGone?: () => void }) {
  const fig = useRef<HTMLElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const gone = useRef(onGone);
  useEffect(() => { gone.current = onGone; });

  useLayoutEffect(() => {
    const el = fig.current!;
    const still = reducedMotion();
    if (leaving) {
      const a = el.animate(
        still
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 9}%) scale(.985)` }],
        { duration: still ? 300 : 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
      );
      a.onfinish = () => gone.current?.();
      return () => a.cancel();
    }
    const a = el.animate(
      still
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: `translateX(${dir * 9}%)`, filter: 'brightness(1.7)' },
            { opacity: 1, offset: 0.45, filter: 'brightness(1.25)' },
            { opacity: 1, transform: 'none', filter: 'brightness(1)' },
          ],
      { duration: still ? 300 : 640, delay: still ? 0 : 150, easing: EASE, fill: 'backwards' },
    );
    // Ken Burns: un acercamiento lento hacia una esquina distinta en cada foto
    let kb: Animation | undefined;
    if (!still && img.current) {
      const corner = ['20% 30%', '80% 30%', '30% 75%', '70% 70%'][p.id.charCodeAt(1) % 4];
      img.current.style.transformOrigin = corner;
      kb = img.current.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }], { duration: hold + 1600, easing: 'linear', fill: 'forwards' });
    }
    return () => { a.cancel(); kb?.cancel(); };
  }, [leaving, dir, hold, p.id]);

  return (
    <figure ref={fig} className={`pj-slide${leaving ? ' leaving' : ''}`} aria-hidden={leaving || undefined}>
      <span className="pj-frame">
        <img ref={img} src={mediaUrl(p, 'display', shareToken)} alt={p.note || (p.takenAt ? `Foto del ${fmtDate(p.takenAt)}` : 'Foto')} draggable={false} />
      </span>
    </figure>
  );
}

/**
 * Modo proyector: pantalla completa, avanza solo y mantiene la pantalla prendida.
 * Teclado: espacio pausa, flechas cambian de foto, F pantalla completa, Esc sale.
 */
export function Projector({ photos, start = 0, title, shareToken, onClose }: { photos: LocalPhoto[]; start?: number; title: string; shareToken?: string; onClose: (id: string) => void }) {
  const n = photos.length;
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const [order, setOrder] = useState(() => [...Array(n).keys()]);
  const [pos, setPos] = useState(Math.min(Math.max(start, 0), n - 1));
  const [dir, setDir] = useState<Dir>(1);
  const [leaving, setLeaving] = useState<{ p: LocalPhoto; dir: Dir } | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(SPEEDS[1].ms);
  const [mixed, setMixed] = useState(false);
  const [ui, setUi] = useState(true);
  const [full, setFull] = useState(false);
  const p = photos[order[pos]] ?? photos[0];

  // Cambiar de foto: primero se asegura de que la próxima esté lista, así no hay negro de más
  const ticket = useRef(0);
  const go = useCallback(
    async (delta: Dir) => {
      const t = ++ticket.current;
      const next = (pos + delta + n) % n;
      await preload(mediaUrl(photos[order[next]], 'display', shareToken));
      if (t !== ticket.current) return;
      setLeaving({ p, dir: delta });
      setDir(delta);
      setPos(next);
    },
    [pos, n, photos, order, shareToken, p],
  );
  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; });

  // Precarga la siguiente mientras se ve esta
  useEffect(() => {
    if (n > 1) preload(mediaUrl(photos[order[(pos + 1) % n]], 'display', shareToken));
  }, [pos, order, photos, n, shareToken]);

  // La barrita de abajo es el reloj: cuando se llena, pasa a la siguiente
  const anim = useRef<Animation | null>(null);
  const playingRef = useRef(playing);
  useEffect(() => { playingRef.current = playing; });
  useEffect(() => {
    const el = bar.current;
    if (!el || n < 2) return;
    const a = el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: speed, fill: 'forwards' });
    if (!playingRef.current) a.pause();
    a.onfinish = () => goRef.current(1);
    anim.current = a;
    return () => a.cancel();
  }, [pos, speed, order, n]);
  useEffect(() => {
    if (playing) anim.current?.play();
    else anim.current?.pause();
  }, [playing]);

  // Los controles se esconden solos mientras corre
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const poke = useCallback(() => {
    setUi(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setUi(false), IDLE);
  }, []);
  const showUi = ui || !playing;

  const close = useCallback(() => {
    const el = root.current;
    const done = () => onClose(p.id);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (!el || reducedMotion()) return done();
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).onfinish = done;
  }, [onClose, p.id]);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen?.().catch(() => {});
  }, []);

  function toggleMix() {
    const cur = order[pos];
    if (mixed) { setOrder([...Array(n).keys()]); setPos(cur); }
    else { setOrder(shuffled(n, cur)); setPos(0); }
    setMixed(m => !m);
  }

  // Abrir: pantalla completa, pantalla siempre prendida, foco adentro y sin scroll atrás
  useEffect(() => {
    const el = root.current!;
    const before = document.activeElement as HTMLElement | null;
    document.documentElement.style.overflow = 'hidden';
    el.focus({ preventScroll: true });
    if (!reducedMotion()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
    el.requestFullscreen?.().catch(() => {});
    const onFs = () => setFull(document.fullscreenElement === el);
    document.addEventListener('fullscreenchange', onFs);

    let lock: WakeLockSentinel | null = null;
    const wake = () => { navigator.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {}); };
    const onVis = () => { if (document.visibilityState === 'visible') wake(); };
    wake();
    document.addEventListener('visibilitychange', onVis);
    idle.current = setTimeout(() => setUi(false), IDLE);

    return () => {
      clearTimeout(idle.current);
      document.documentElement.style.overflow = '';
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
      before?.focus?.({ preventScroll: true });
    };
  }, []);

  function onKey(e: React.KeyboardEvent) {
    poke();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === ' ' || e.key === 'k') { e.preventDefault(); setPlaying(v => !v); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFull(); }
    else if (e.key === 'Tab' && root.current) trap(e.nativeEvent, root.current);
  }

  // Deslizar en el celu; un toque muestra u oculta los controles
  const touch = useRef<{ x: number; y: number } | null>(null);
  function down(e: React.PointerEvent) { touch.current = { x: e.clientX, y: e.clientY }; }
  function up(e: React.PointerEvent) {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      if (showUi && playing) { clearTimeout(idle.current); setUi(false); } else poke();
    }
  }

  const caption = [p.place, p.takenAt ? fmtDate(p.takenAt) : ''].filter(Boolean).join(', ');

  return (
    <div
      ref={root}
      className={`projector${showUi ? '' : ' idle'}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Modo proyector: ${title}`}
      tabIndex={-1}
      onKeyDown={onKey}
      onPointerMove={e => { if (e.pointerType === 'mouse') poke(); }}
    >
      <div className="pj-stage" onPointerDown={down} onPointerUp={up}>
        {leaving && <Slide key={`out-${leaving.p.id}`} p={leaving.p} shareToken={shareToken} dir={leaving.dir} hold={speed} leaving onGone={() => setLeaving(null)} />}
        <Slide key={p.id} p={p} shareToken={shareToken} dir={dir} hold={speed} />
      </div>

      <div className="pj-caption" key={`c-${p.id}`} aria-live="polite">
        {p.takenAt && <DateStamp date={p.takenAt} className="pj-stamp" />}
        {p.note && <p className="pj-note">{p.note}</p>}
        <p className="sr">{caption}</p>
      </div>

      <div className="pj-top">
        <p className="pj-title">
          <b>{title}</b> <span>{pos + 1} de {n}</span>
        </p>
        <button className="pj-btn" type="button" aria-label="Salir del modo proyector" onClick={close}>
          <IconClose />
        </button>
      </div>

      <div className="pj-bar">
        <button className="pj-btn" type="button" aria-label="Foto anterior" onClick={() => go(-1)} disabled={n < 2}>
          <IconBack />
        </button>
        <button className="pj-btn pj-play" type="button" aria-label={playing ? 'Pausar' : 'Seguir'} onClick={() => setPlaying(v => !v)} disabled={n < 2}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button className="pj-btn" type="button" aria-label="Foto siguiente" onClick={() => go(1)} disabled={n < 2}>
          <IconNext />
        </button>
        <span className="pj-sep" aria-hidden="true" />
        <button
          className="pj-btn pj-speed"
          type="button"
          aria-label={`Cada ${speed / 1000} segundos. Cambiar`}
          title="Tiempo por foto"
          onClick={() => setSpeed(v => SPEEDS[(SPEEDS.findIndex(x => x.ms === v) + 1) % SPEEDS.length].ms)}
          disabled={n < 2}
        >
          {SPEEDS.find(x => x.ms === speed)?.label}
        </button>
        <button className={`pj-btn${mixed ? ' on' : ''}`} type="button" aria-pressed={mixed} aria-label="Mezclar el orden" title="Mezclar" onClick={toggleMix} disabled={n < 3}>
          <IconShuffle />
        </button>
        <button className="pj-btn" type="button" aria-label={full ? 'Salir de pantalla completa' : 'Pantalla completa'} title="Pantalla completa (F)" onClick={toggleFull}>
          {full ? <IconShrink /> : <IconExpand />}
        </button>
      </div>
      <span className="pj-progress" aria-hidden="true"><span ref={bar} /></span>
    </div>
  );
}
