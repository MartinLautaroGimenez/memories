'use client';

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { fmtDate } from '@/lib/format';
import { takeFlip } from './handoff';
import { clamp, dealIn, EASE, reducedMotion, rng, tiltRelease, tiltTo } from './motion';
import { Print, type LocalPhoto } from './Print';

type Pos = { x: number; y: number; r: number; s: number; x0: number; y0: number; r0: number; rest: number };

export type SpreadHandle = { tidy(): void; printFor(id: string): HTMLElement | null };

type Props = {
  photos: LocalPhoto[];
  shareToken?: string;
  canRemove: (p: LocalPhoto) => boolean;
  onOpen: (id: string, el: HTMLElement) => void;
  onRemove: (p: LocalPhoto) => void;
  onMoved: () => void;
};

/** Vista Mesa: copias sueltas, levemente rotadas, que se pueden arrastrar. */
export const Spread = forwardRef<SpreadHandle, Props>(function Spread({ photos, shareToken, canRemove, onOpen, onRemove, onMoved }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const pos = useRef(new Map<string, Pos>());
  const known = useRef(new Set<string>());
  const z = useRef(10);
  const cb = useRef({ onOpen, onMoved });
  cb.current = { onOpen, onMoved };

  const apply = (el: HTMLElement, p: Pos) => {
    el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${p.r.toFixed(2)}deg) scale(${p.s.toFixed(3)})`;
  };

  const restFor = (id: string): Pos => {
    const r = rng(`rest:${id}`);
    const x = (r() - 0.5) * 14, y = (r() - 0.5) * 12, rot = (r() - 0.5) * 6;
    return { x, y, r: rot, s: 1, x0: x, y0: y, r0: rot, rest: rot };
  };

  // Posiciona las copias nuevas; la primera vez, con el FLIP desde la pila.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const prints = [...el.querySelectorAll<HTMLElement>('.print[data-id]')];
    const fresh: HTMLElement[] = [];
    for (const p of prints) {
      const id = p.dataset.id!;
      let st = pos.current.get(id);
      if (!st) {
        st = restFor(id);
        pos.current.set(id, st);
      }
      apply(p, st);
      if (!known.current.has(id)) fresh.push(p);
    }
    const firstRender = known.current.size === 0;
    prints.forEach(p => known.current.add(p.dataset.id!));
    if (!fresh.length) return;

    const flown = new Set<HTMLElement>();
    const flip = firstRender ? takeFlip() : null;
    if (flip && !reducedMotion()) {
      for (const src of flip) {
        const target = fresh.find(p => p.dataset.id === src.id);
        if (!target) continue;
        const st = pos.current.get(src.id)!;
        const cell = target.parentElement!.getBoundingClientRect();
        const lx = cell.left + target.offsetLeft + target.offsetWidth / 2;
        const ly = cell.top + target.offsetTop + target.offsetHeight / 2;
        target.parentElement!.style.zIndex = '5';
        target
          .animate(
            [
              { transform: `translate(${src.cx - lx}px,${src.cy - ly}px) rotate(${src.rot}deg) scale(${src.w / target.offsetWidth})` },
              { transform: `translate(${st.x}px,${st.y}px) rotate(${st.r}deg) scale(1)` },
            ],
            { duration: 820, easing: EASE },
          )
          .finished.then(() => { target.parentElement!.style.zIndex = ''; })
          .catch(() => {});
        flown.add(target);
      }
    }
    dealIn(fresh.filter(p => !flown.has(p)), flown.size ? 200 : firstRender ? 40 : 0, 60);
  }, [photos]);

  useImperativeHandle(ref, () => ({
    tidy() {
      const el = root.current;
      if (!el) return;
      [...el.querySelectorAll<HTMLElement>('.print[data-id]')].forEach((p, i) => {
        const st = pos.current.get(p.dataset.id!);
        if (!st) return;
        const from = p.style.transform;
        Object.assign(st, { x: st.x0, y: st.y0, r: st.r0, rest: st.r0, s: 1 });
        apply(p, st);
        if (!reducedMotion()) p.animate([{ transform: from }, { transform: p.style.transform }], { duration: 650, delay: i * 30, easing: EASE, fill: 'backwards' });
      });
    },
    printFor(id) {
      return root.current?.querySelector<HTMLElement>(`.print[data-id="${CSS.escape(id)}"]`) ?? null;
    },
  }));

  // Arrastre con inercia. En táctil hay que mantener presionado para no pelear con el scroll.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let dragging: HTMLElement | null = null;

    const onTouchMove = (e: TouchEvent) => { if (dragging) e.preventDefault(); };
    const onHover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || dragging) return;
      const p = (e.target as Element).closest<HTMLElement>('.print.ready');
      if (p) tiltTo(p, p.querySelector<HTMLElement>('.paper')!, e, 8);
    };
    const onOut = (e: PointerEvent) => {
      const p = (e.target as Element).closest<HTMLElement>('.print');
      if (p && !p.contains(e.relatedTarget as Node)) tiltRelease(p.querySelector<HTMLElement>('.paper'));
    };
    const onKey = (e: KeyboardEvent) => {
      const p = (e.target as Element).closest<HTMLElement>('.print.ready');
      if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cb.current.onOpen(p.dataset.id!, p); }
    };

    const onDown = (e: PointerEvent) => {
      const p = (e.target as Element).closest<HTMLElement>('.print[data-id]');
      if (!p || e.button > 0 || (e.target as Element).closest('button')) return;
      const st = pos.current.get(p.dataset.id!);
      if (!st) return;
      const touch = e.pointerType !== 'mouse';
      const sx = e.clientX, sy = e.clientY, t0 = performance.now(), ox = st.x, oy = st.y;
      let active = false, hold = 0, lx = sx, lt = t0, vx = 0, vy = 0, ly = sy;
      if (!touch) e.preventDefault();

      const begin = () => {
        active = true;
        dragging = p;
        try { p.setPointerCapture(e.pointerId); } catch {}
        p.classList.add('lifted');
        p.style.willChange = 'transform';
        p.parentElement!.style.zIndex = String(++z.current);
        tiltRelease(p.querySelector<HTMLElement>('.paper'));
        st.s = 1.05;
        apply(p, st);
        if (touch) navigator.vibrate?.(8);
      };
      if (touch) hold = window.setTimeout(begin, 260);

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!active) {
          if (touch) { if (Math.hypot(dx, dy) > 9) { clearTimeout(hold); end(); } return; }
          if (Math.hypot(dx, dy) < 5) return;
          begin();
        }
        const now = performance.now(), dt = Math.max(8, now - lt);
        vx = vx * 0.5 + ((ev.clientX - lx) / dt) * 16 * 0.5;
        vy = vy * 0.5 + ((ev.clientY - ly) / dt) * 16 * 0.5;
        lx = ev.clientX; ly = ev.clientY; lt = now;
        st.x = ox + dx; st.y = oy + dy;
        st.r += (st.rest + clamp(vx * 1.1, -16, 16) - st.r) * 0.22;
        apply(p, st);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        clearTimeout(hold);
        end();
        if (active) {
          p.classList.remove('lifted');
          dragging = null;
          st.rest = clamp(st.r * 0.5 + (Math.random() - 0.5) * 5, -10, 10);
          glide(p, st, vx, vy);
          cb.current.onMoved();
        } else if (ev.type === 'pointerup' && performance.now() - t0 < 700 && p.classList.contains('ready')) {
          cb.current.onOpen(p.dataset.id!, p);
        }
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };

    const glide = (p: HTMLElement, st: Pos, vx: number, vy: number) => {
      const step = () => {
        vx *= 0.9; vy *= 0.9;
        st.x += vx; st.y += vy;
        st.s += (1 - st.s) * 0.2;
        st.r += (st.rest - st.r) * 0.14;
        apply(p, st);
        if (Math.abs(vx) + Math.abs(vy) > 0.12 || Math.abs(st.s - 1) > 0.002 || Math.abs(st.r - st.rest) > 0.05) requestAnimationFrame(step);
        else { st.s = 1; apply(p, st); p.style.willChange = ''; }
      };
      requestAnimationFrame(step);
    };

    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('pointermove', onHover);
    el.addEventListener('pointerout', onOut);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('pointermove', onHover);
      el.removeEventListener('pointerout', onOut);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="spread" ref={root}>
      {photos.map(p => {
        const r = rng(`${p.id}`);
        const pw = [100, 94, 86][Math.floor(r() * 3)];
        const pm = ((100 - pw) * r()).toFixed(1);
        const state = p.status === 'ready' ? 'ready' : p.status === 'failed' ? 'failed' : 'pending';
        const label = p.status === 'ready' ? `${p.note || 'Foto sin nota'}${p.takenAt ? `, ${fmtDate(p.takenAt)}` : ''}` : p.status === 'failed' ? `${p.file}: no se pudo revelar` : `${p.file}: revelando`;
        return (
          <div className="cell" key={p.id}>
            <Print
              photo={p}
              shareToken={shareToken}
              className={state}
              role={state === 'ready' ? 'button' : undefined}
              tabIndex={state === 'ready' ? 0 : -1}
              aria-label={label}
              style={{ ['--pw' as string]: `${pw}%`, ['--pm' as string]: `${pm}%` }}
            >
              {p.status === 'failed' && (
                <>
                  <p className="print-note">{p.error ?? `No pudimos leer ${p.file}.`}</p>
                  {canRemove(p) && (
                    <button className="remove" type="button" onClick={() => onRemove(p)}>
                      Sacar
                    </button>
                  )}
                </>
              )}
            </Print>
          </div>
        );
      })}
    </div>
  );
});
