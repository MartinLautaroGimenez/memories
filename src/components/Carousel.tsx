'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { IconBack, IconNext } from './icons';
import { reducedMotion } from './motion';
import { aspect, mediaUrl, placeholder, type LocalPhoto } from './Print';

export type CarouselHandle = { goTo(i: number): void; windowFor(i: number): HTMLElement | null };

type Props = { photos: LocalPhoto[]; title: string; shareToken?: string; onOpen: (i: number, el: HTMLElement) => void };

/** Vista Carrusel: anillo 3D de diapositivas, como en un proyector. */
export const Carousel = forwardRef<CarouselHandle, Props>(function Carousel({ photos, title, shareToken, onOpen }, ref) {
  const car = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const st = useRef({ theta: 0, target: 0, raf: 0, R: 0, S: 0, front: -1 });
  const [front, setFront] = useState(0);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  const n = photos.length;
  const step = n ? 360 / n : 360;

  const render = useCallback(() => {
    const s = st.current;
    if (!ring.current) return;
    ring.current.style.transform = `translateZ(${-s.R}px) rotateX(-4deg) rotateY(${s.theta}deg)`;
    const slides = ring.current.children as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < slides.length; i++) {
      slides[i].style.setProperty('--f', ((1 + Math.cos(((s.theta + i * step) * Math.PI) / 180)) / 2).toFixed(3));
    }
    const f = ((Math.round(-s.theta / step) % n) + n) % n;
    if (f !== s.front) {
      s.front = f;
      setFront(f);
    }
  }, [n, step]);

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
    s.R = n < 3 ? s.S * 0.9 : (s.S / 2 / Math.tan(Math.PI / n)) * 1.1;
    [...(ring.current.children as HTMLCollectionOf<HTMLElement>)].forEach((el, i) => {
      el.style.transform = `rotateY(${i * step}deg) translateZ(${s.R}px)`;
    });
    render();
  }, [n, step, render]);

  const goTo = useCallback((i: number) => {
    const s = st.current;
    const want = -i * step;
    s.target += ((((want - s.target) % 360) + 540) % 360) - 180;
    kick();
  }, [step, kick]);

  useImperativeHandle(ref, () => ({
    goTo,
    windowFor: i => (ring.current?.children[i]?.querySelector<HTMLElement>('.win') ?? null),
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
        const i = Number(drag.slide.dataset.i);
        if (i === s.front) onOpenRef.current(i, drag.slide.querySelector<HTMLElement>('.win')!);
        else goTo(i);
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
        const win = ring.current?.children[s.front]?.querySelector<HTMLElement>('.win');
        if (win) onOpenRef.current(s.front, win);
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
  }, [step, render, kick, goTo]);

  if (!n) return null;
  const p = photos[front] ?? photos[0];

  return (
    <>
      <div className="carousel" ref={car} tabIndex={0} role="region" aria-roledescription="carrusel" aria-label={`Diapositivas de ${title}. Usá las flechas para girar y Enter para abrir.`}>
        <div className="floor" />
        <div className="ring" ref={ring}>
          {photos.map((ph, i) => {
            const ar = aspect(ph);
            const ww = ar < 0.95 ? `${(64 * Math.min(1, ar)).toFixed(1)}%` : ar < 1.15 ? '62%' : '76%';
            const bg = placeholder(ph.thumbhash);
            return (
              <button className="slide" type="button" tabIndex={-1} key={ph.id} data-i={i} aria-label={ph.note || `Foto ${i + 1}`} style={{ ['--ar' as string]: ar, ['--c' as string]: ph.color ?? '#888', ['--ww' as string]: ww }}>
                <span className="mount">
                  <span className="num">{i + 1}</span>
                  <span className="win" style={{ backgroundImage: bg ? `url(${bg})` : undefined }}>
                    <img src={mediaUrl(ph.id, 'thumb', shareToken)} alt="" draggable={false} decoding="async" />
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
