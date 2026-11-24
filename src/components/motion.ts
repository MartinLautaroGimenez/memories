'use client';

/** Utilidades de movimiento compartidas. Solo `transform`, `opacity` y `filter` puntual. */

export const EASE = 'cubic-bezier(.16,1,.3,1)';
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Revelado: la copia aparece blanca y la imagen emerge como en la cubeta. */
export function develop(el: HTMLElement, dur = 2400) {
  if (reducedMotion()) return;
  el.animate(
    [
      { filter: 'brightness(2.2) contrast(.28) saturate(0) blur(2px)', opacity: 0.12 },
      { filter: 'brightness(1.35) contrast(.7) saturate(.35) blur(.6px)', opacity: 0.75, offset: 0.45 },
      { filter: 'none', opacity: 1 },
    ],
    { duration: dur, easing: 'cubic-bezier(.3,.6,.3,1)' },
  );
}

/** Las copias caen sobre la mesa en cascada. */
export function dealIn(els: Element[], base = 0, gap = 70) {
  if (reducedMotion()) return;
  els.forEach((el, i) => {
    const tf = getComputedStyle(el).transform;
    const rest = tf === 'none' ? '' : tf;
    (el as HTMLElement).animate(
      [
        { transform: `${rest} translateY(-22px) scale(1.07)`, opacity: 0 },
        { transform: rest || 'none', opacity: 1 },
      ],
      { duration: 640, delay: base + i * gap, easing: 'cubic-bezier(.2,.9,.3,1.12)', fill: 'backwards' },
    );
  });
}

/* ---------- Inclinación con reflejo de papel brillante ---------- */
type Tilt = { x: number; y: number; tx: number; ty: number; active: boolean };
const tilts = new Map<HTMLElement, Tilt>();
let raf = 0;

export function tiltTo(host: Element, target: HTMLElement, e: PointerEvent | React.PointerEvent, max: number) {
  if (reducedMotion()) return;
  const r = host.getBoundingClientRect();
  const px = clamp((e.clientX - r.left) / r.width, 0, 1);
  const py = clamp((e.clientY - r.top) / r.height, 0, 1);
  let s = tilts.get(target);
  if (!s) {
    s = { x: 0, y: 0, tx: 0, ty: 0, active: true };
    tilts.set(target, s);
  }
  s.tx = (0.5 - py) * 2 * max;
  s.ty = (px - 0.5) * 2 * max;
  s.active = true;
  target.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
  target.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
  target.classList.add('is-tilting');
  if (!raf) raf = requestAnimationFrame(loop);
}

export function tiltRelease(target: HTMLElement | null | undefined) {
  if (!target) return;
  const s = tilts.get(target);
  if (!s) return;
  s.tx = 0;
  s.ty = 0;
  s.active = false;
  target.classList.remove('is-tilting');
  if (!raf) raf = requestAnimationFrame(loop);
}

function loop() {
  let busy = false;
  for (const [el, s] of tilts) {
    s.x += (s.tx - s.x) * 0.14;
    s.y += (s.ty - s.y) * 0.14;
    el.style.setProperty('--rx', `${s.x.toFixed(2)}deg`);
    el.style.setProperty('--ry', `${s.y.toFixed(2)}deg`);
    if (Math.abs(s.tx - s.x) > 0.02 || Math.abs(s.ty - s.y) > 0.02) busy = true;
    else if (!s.active) {
      tilts.delete(el);
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
    }
  }
  raf = busy ? requestAnimationFrame(loop) : 0;
}

/* ---------- Números estables a partir de un id ---------- */
export function rng(seed: string) {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    a ^= seed.charCodeAt(i);
    a = Math.imul(a, 16777619);
  }
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relación ancho/alto de una copia con borde de papel de 3.4%. */
export const cardRatio = (ar: number) => 1 / (0.932 / ar + 0.068);
