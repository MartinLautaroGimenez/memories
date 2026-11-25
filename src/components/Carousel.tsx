'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { IconBack, IconNext } from './icons';
import { reducedMotion } from './motion';
import { aspect, mediaUrl, placeholder, type LocalPhoto } from './Print';

const SLOTS = 24;

export type CarouselHandle = { goTo(i: number): void; windowFor(i: number): HTMLElement | null };

type Props = { photos: LocalPhoto[]; title: string; shareToken?: string; onOpen: (i: number, el: HTMLElement) => void };

/** Vista Carrusel: anillo 3D de diapositivas, como en un proyector. */
export const Carousel = forwardRef<CarouselHandle, Props>(function Carousel({ photos, title, shareToken, onOpen }, ref) {
  const car = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const st = useRef({ theta: 0, target: 0, raf: 0, R: 0, S: 0, pos: Number.NaN });
  // Posición sin límites (puede dar varias vueltas); la foto de adelante es pos módulo n
  const [pos, setPos] = useState(0);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  const n = photos.length;
  /*
   * El anillo tiene como mucho SLOTS diapositivas: con cientos de fotos un anillo
   * completo sería enorme y quedaría fuera de la vista. Las de atrás cambian de foto
   * mientras no se ven.
   */
  const L = Math.min(n, SLOTS);
  const step = L ? 360 / L : 360;
  const mod = (a: number, b: number) => ((a % b) + b) % b;
  const front = n ? mod(pos, n) : 0;
  /** La foto (sin límites) que muestra la diapositiva j cuando adelante está `at`. */
  const slotPhoto = (j: number, at: number) => at + mod(j - at + Math.floor(L / 2), L) - Math.floor(L / 2);

  const render = useCallback(() => {
    const s = st.current;
    if (!ring.current) return;
    ring.current.style.transform = `translateZ(${-s.R}px) rotateX(-4deg) rotateY(${s.theta}deg)`;
    const slides = ring.current.children as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < slides.length; i++) {
      slides[i].style.setProperty('--f', ((1 + Math.cos(((s.theta + i * step) * Math.PI) / 180)) / 2).toFixed(3));
    }
    const f = Math.round(-s.theta / step);
    if (f !== s.pos) {
      s.pos = f;
      setPos(f);
    }
  }, [step]);

  const kick = useCallback(() => {
    const s = st.current;
    if (reducedMotion()) { s.theta = s.target; render(); return; }
    if (s.raf) return;
    const tick = () => {
      const d = s.target - s.theta;
      s.theta += d * 0.13;
      if (Math.abs(d) < 0.03) { s.theta = s.target; render(); s.raf = 0; return; }
      render();
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  }, [render]);

  const size = useCallback(() => {
    const s = st.current;
    if (!car.current || !ring.current) return;
    s.S = Math.max(170, Math.min(350, Math.min(window.innerWidth * 0.5, window.innerHeight * 0.4)));
    car.current.style.setProperty('--S', `${s.S}px`);
    s.R = L < 3 ? s.S * 0.9 : (s.S / 2 / Math.tan(Math.PI / L)) * 1.1;
    [...(ring.current.children as HTMLCollectionOf<HTMLElement>)].forEach((el, i) => {
      el.style.transform = `rotateY(${i * step}deg) translateZ(${s.R}px)`;
    });
    render();
  }, [L, step, render]);

  /** Distancia más corta (en fotos) desde la de adelante hasta la foto i. */
  const delta = useCallback((i: number) => {
    const at = Math.round(-st.current.target / step);
    return { at, d: (((i - (((at % n) + n) % n)) % n) + n + Math.floor(n / 2)) % n - Math.floor(n / 2) };
  }, [n, step]);

  const goTo = useCallback((i: number) => {
    const { at, d } = delta(i);
    st.current.target = -(at + d) * step;
    kick();
  }, [delta, step, kick]);

  useImperativeHandle(ref, () => ({
    goTo,
    windowFor: i => {
      const { at, d } = delta(i);
      if (Math.abs(d) >= L / 2) return null;
      return ring.current?.children[(((at + d) % L) + L) % L]?.querySelector<HTMLElement>('.win') ?? null;
    },
  }));

  useEffect(() => {
    size();
    const s = st.current;
    if (!reducedMotion()) {
      s.theta = step * 1.6;
      render();
      ring.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
      kick();
    }
    const onResize = () => size();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [size, render, kick, step]);

  // Arrastre, rueda horizontal y teclado
  useEffect(() => {
    const el = car.current;
    if (!el) return;
    const s = st.current;
    let drag: { x: number; y: number; th: number; vel: number; lx: number; lt: number; moved: boolean; id: number; slide: HTMLElement | null } | null = null;
    const degPerPx = () => step / (s.S * 1.1);

    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      drag = { x: e.clientX, y: e.clientY, th: s.theta, vel: 0, lx: e.clientX, lt: performance.now(), moved: false, id: e.pointerId, slide: (e.target as Element).closest<HTMLElement>('.slide') };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < 6) return;
        if (Math.abs(e.clientY - drag.y) > Math.abs(dx)) { drag = null; return; }
        drag.moved = true;
        el.classList.add('dragging');
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
      const now = performance.now();
      drag.vel = drag.vel * 0.6 + ((e.clientX - drag.lx) / Math.max(8, now - drag.lt)) * 16 * 0.4;
      drag.lx = e.clientX;
      drag.lt = now;
      s.theta = drag.th + dx * degPerPx();
      s.target = s.theta;
      render();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      el.classList.remove('dragging');
      if (drag.moved) {
        s.target = Math.round((s.theta + drag.vel * degPerPx() * 9) / step) * step;
        kick();
      } else if (drag.slide && e.type === 'pointerup') {
        const k = Number(drag.slide.dataset.k);
        if (k === s.pos) onOpenRef.current(((k % n) + n) % n, drag.slide.querySelector<HTMLElement>('.win')!);
        else { s.target = -k * step; kick(); }
      }
      drag = null;
    };
    let wt = 0;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      clearTimeout(wt);
      s.theta -= e.deltaX * 0.12;
      s.target = s.theta;
      render();
      wt = window.setTimeout(() => { s.target = Math.round(s.theta / step) * step; kick(); }, 120);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); s.target -= step; kick(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); s.target += step; kick(); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const win = ring.current?.children[((s.pos % L) + L) % L]?.querySelector<HTMLElement>('.win');
        if (win) onOpenRef.current(((s.pos % n) + n) % n, win);
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('keydown', key);
    };
  }, [step, render, kick, goTo, L, n]);

  if (!n) return null;
  const p = photos[front] ?? photos[0];
  const at = Math.round(pos);

  return (
    <>
      <div className="carousel" ref={car} tabIndex={0} role="region" aria-roledescription="carrusel" aria-label={`Diapositivas de ${title}. Usá las flechas para girar y Enter para abrir.`}>
        <div className="floor" />
        <div className="ring" ref={ring}>
          {Array.from({ length: L }, (_, j) => {
            const k = slotPhoto(j, at);
            const i = mod(k, n);
            const ph = photos[i];
            const ar = aspect(ph);
            const ww = ar < 0.95 ? `${(64 * Math.min(1, ar)).toFixed(1)}%` : ar < 1.15 ? '62%' : '76%';
            const bg = placeholder(ph.thumbhash);
            return (
              <button className="slide" type="button" tabIndex={-1} key={j} data-k={k} aria-label={ph.note || `Foto ${i + 1}`} style={{ ['--ar' as string]: ar, ['--c' as string]: ph.color ?? '#888', ['--ww' as string]: ww }}>
                <span className="mount">
                  <span className="num">{i + 1}</span>
                  <span className="win" style={{ backgroundImage: bg ? `url(${bg})` : undefined }}>
                    <img src={mediaUrl(ph, 'thumb', shareToken)} alt="" draggable={false} decoding="async" />
                  </span>
                  <span className="lbl">
                    {title} {i + 1}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="c-foot">
        <button className="icon-btn" type="button" aria-label="Diapositiva anterior" onClick={() => { st.current.target += step; kick(); }}>
          <IconBack />
        </button>
        <p className="c-cap" aria-live="polite">
          {p.note || 'Sin nota todavía'}
          <span className="c-count">
            {front + 1} de {n}
          </span>
        </p>
        <button className="icon-btn" type="button" aria-label="Diapositiva siguiente" onClick={() => { st.current.target -= step; kick(); }}>
          <IconNext />
        </button>
      </div>
    </>
  );
});
