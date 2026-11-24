'use client';

import { geoGraticule10, geoOrthographic, geoPath, geoDistance, type GeoPermissibleObjects } from 'd3-geo';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';
import { monthYear, plural } from '@/lib/format';
import { reducedMotion } from './motion';

export type AtlasAlbum = { slug: string; title: string; place: string; lat: number; lng: number; count: number; from: string | null };

type RGB = [number, number, number];
const hex = (v: string, fallback: RGB): RGB => {
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim());
  return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) as RGB : fallback;
};
const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map(i => Math.round(a[i] * t + b[i] * (1 - t))) as RGB;

/** Colores del tema actual (los tokens de app.css), para dibujar en el canvas. */
function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name);
  const ink = hex(v('--ink'), [23, 32, 36]), paper = hex(v('--plate-a'), [253, 254, 254]), stamp = hex(v('--stamp'), [255, 107, 18]);
  const dark = paper[0] + paper[1] + paper[2] < 384;
  return {
    sphere: rgba(paper), edge: rgba(ink, 0.18), grid: rgba(ink, 0.07),
    land: rgba(mix(ink, paper, 0.14)), coast: rgba(ink, 0.5), stamp: rgba(stamp), glow: rgba(stamp, dark ? 0.6 : 0.45),
    shine: `rgba(255,255,255,${dark ? 0.07 : 0.4})`, shade: `rgba(0,0,0,${dark ? 0.35 : 0.12})`,
  };
}

/** El Atlas: un globo con un punto encendido por cada viaje. Se dibuja sin servicios externos. */
export function Atlas({ albums, children }: { albums: AtlasAlbum[]; children?: React.ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const [hover, setHover] = useState<AtlasAlbum | null>(null);
  const land = useMemo(() => {
    const topo = land110 as unknown as Parameters<typeof feature>[0];
    return feature(topo, (topo as unknown as { objects: { land: Parameters<typeof feature>[1] } }).objects.land) as unknown as GeoPermissibleObjects;
  }, []);
  const state = useRef({ rot: [0, -20] as [number, number], vel: 0, drag: false, raf: 0, size: 0, hover: null as AtlasAlbum | null, target: null as AtlasAlbum | null });
  // Para que la lista pueda girar el globo hacia un viaje
  const api = useRef<{ focus(a: AtlasAlbum | null): void } | null>(null);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const s = state.current;
    // Arranca mirando al promedio de los viajes
    if (albums.length) {
      const lng = albums.reduce((a, b) => a + b.lng, 0) / albums.length;
      const lat = albums.reduce((a, b) => a + b.lat, 0) / albums.length;
      s.rot = [-lng, -lat * 0.6];
    }
    let tokens = readTokens();
    const mo = new MutationObserver(() => { tokens = readTokens(); draw(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => { tokens = readTokens(); draw(); };
    mq.addEventListener('change', onScheme);

    const projection = geoOrthographic().clipAngle(90).precision(0.5);
    const graticule = geoGraticule10();

    function resize() {
      const box = c.parentElement!.getBoundingClientRect();
      const size = Math.max(260, Math.min(box.width, 640, window.innerHeight - 140));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = size * dpr; c.height = size * dpr;
      c.style.width = `${size}px`; c.style.height = `${size}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.size = size;
      projection.translate([size / 2, size / 2]).scale(size / 2 - 6);
      draw();
    }

    function draw() {
      const size = s.size;
      projection.rotate([s.rot[0], s.rot[1], 0]);
      const path = geoPath(projection, ctx);
      ctx.clearRect(0, 0, size, size);
      // Esfera
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = tokens.sphere; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = tokens.edge; ctx.stroke();
      // Retícula
      ctx.beginPath(); path(graticule); ctx.strokeStyle = tokens.grid; ctx.lineWidth = 0.6; ctx.stroke();
      // Tierra, como grabado: relleno suave y contorno de tinta
      ctx.beginPath(); path(land); ctx.fillStyle = tokens.land; ctx.fill();
      ctx.strokeStyle = tokens.coast; ctx.lineWidth = 0.7; ctx.stroke();
      // Luz de arriba a la izquierda, para que se lea como una esfera
      const r0 = size / 2 - 6;
      const shine = ctx.createRadialGradient(size * 0.36, size * 0.3, 0, size * 0.36, size * 0.3, r0 * 0.9);
      shine.addColorStop(0, tokens.shine); shine.addColorStop(1, 'rgba(255,255,255,0)');
      const rim = ctx.createRadialGradient(size / 2, size / 2, r0 * 0.62, size / 2, size / 2, r0);
      rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, tokens.shade);
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = shine; ctx.fill(); ctx.fillStyle = rim; ctx.fill();
      // Viajes: LED naranja del fechador
      const center: [number, number] = [-s.rot[0], -s.rot[1]];
      for (const a of albums) {
        if (geoDistance([a.lng, a.lat], center) > Math.PI / 2 - 0.02) continue;
        const [x, y] = projection([a.lng, a.lat])!;
        const r = 3.5 + Math.min(6, Math.sqrt(a.count));
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
        glow.addColorStop(0, tokens.glow);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = tokens.stamp; ctx.beginPath(); ctx.arc(x, y, s.hover === a ? r + 2 : r, 0, Math.PI * 2); ctx.fill();
      }
    }

    function hit(e: PointerEvent): AtlasAlbum | null {
      const b = c.getBoundingClientRect();
      const px = e.clientX - b.left, py = e.clientY - b.top;
      const center: [number, number] = [-s.rot[0], -s.rot[1]];
      let best: AtlasAlbum | null = null, bestD = 18;
      for (const a of albums) {
        if (geoDistance([a.lng, a.lat], center) > Math.PI / 2) continue;
        const [x, y] = projection([a.lng, a.lat])!;
        const d = Math.hypot(x - px, y - py);
        if (d < bestD) { bestD = d; best = a; }
      }
      return best;
    }

    let last = { x: 0, y: 0, t: 0 }, moved = 0;
    const down = (e: PointerEvent) => { s.drag = true; s.target = null; moved = 0; last = { x: e.clientX, y: e.clientY, t: performance.now() }; c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!s.drag) {
        const h = hit(e);
        if (h !== s.hover) { s.hover = h; setHover(h); c.style.cursor = h ? 'pointer' : 'grab'; draw(); }
        return;
      }
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const k = 140 / s.size;
      s.rot = [s.rot[0] + dx * k, Math.max(-80, Math.min(80, s.rot[1] - dy * k))];
      s.vel = dx * k;
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      draw();
    };
    const up = (e: PointerEvent) => {
      s.drag = false;
      if (moved < 5) {
        const h = hit(e);
        if (h) router.push(`/a/${h.slug}`);
      }
      kick();
    };
    function kick() {
      if (s.raf || reducedMotion()) return;
      const tick = () => {
        if (!s.drag) {
          if (s.target) {
            // Va hacia el viaje elegido en la lista, por el camino más corto
            const [tl, tp] = [-s.target.lng, Math.max(-60, Math.min(60, -s.target.lat))];
            const dl = ((tl - s.rot[0] + 540) % 360) - 180;
            s.rot = [s.rot[0] + dl * 0.12, s.rot[1] + (tp - s.rot[1]) * 0.12];
            s.vel = 0;
          } else {
            s.vel *= 0.94;
            const spin = s.hover ? 0 : 0.04; // gira despacito cuando no lo tocás
            s.rot = [s.rot[0] + s.vel + spin, s.rot[1]];
          }
          draw();
        }
        s.raf = requestAnimationFrame(tick);
      };
      s.raf = requestAnimationFrame(tick);
    }
    api.current = {
      focus(a) {
        s.target = a; s.hover = a;
        if (a && reducedMotion()) { s.rot = [-a.lng, Math.max(-60, Math.min(60, -a.lat))]; }
        draw();
      },
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    resize();
    kick();
    return () => {
      cancelAnimationFrame(s.raf); s.raf = 0; api.current = null;
      mo.disconnect();
      mq.removeEventListener('change', onScheme);
      window.removeEventListener('resize', onResize);
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
  }, [albums, land, router]);

  return (
    <div className="atlas">
      <div className="atlas-head">{children}</div>
      <div className="atlas-globe">
        <canvas ref={canvas} role="img" aria-label={`Globo con ${plural(albums.length, 'viaje', 'viajes')}. Arrastralo para girarlo.`} />
        <p className="atlas-hover" aria-live="polite">{hover ? `${hover.title}${hover.place ? `, ${hover.place}` : ''}` : 'Arrastrá el globo para girarlo'}</p>
      </div>
      <ol className="atlas-list">
        {albums.map(a => (
          <li key={a.slug}>
            <Link
              href={`/a/${a.slug}`}
              onPointerEnter={() => { api.current?.focus(a); setHover(a); }}
              onPointerLeave={() => { api.current?.focus(null); setHover(null); }}
              onFocus={() => { api.current?.focus(a); setHover(a); }}
              onBlur={() => { api.current?.focus(null); setHover(null); }}
            >
              <span className="atlas-dot" aria-hidden="true" />
              <span className="atlas-title">{a.title}</span>
              <span className="atlas-meta">{[a.place, a.from ? monthYear(a.from) : '', plural(a.count, 'foto', 'fotos')].filter(Boolean).join(', ')}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
