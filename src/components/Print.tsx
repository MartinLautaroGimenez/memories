'use client';

import { forwardRef, useEffect, useMemo, useRef } from 'react';
import { thumbHashToDataURL } from 'thumbhash';
import type { PhotoDTO } from '@/lib/types';
import { DateStamp } from './DateStamp';
import { develop } from './motion';

export type LocalPhoto = PhotoDTO & { local?: { url: string; w?: number; h?: number } };

export const aspect = (p: LocalPhoto) => {
  const w = p.w ?? p.local?.w, h = p.h ?? p.local?.h;
  return w && h ? w / h : 1.5;
};

/**
 * URL de una imagen. Con la foto (y no solo su id) la URL lleva la rotación:
 * al girarla cambia la URL y ningún navegador ni la caché offline muestran la versión vieja.
 */
export function mediaUrl(photo: string | { id: string; rot?: number }, kind: 'thumb' | 'display' | 'original', shareToken?: string) {
  const id = typeof photo === 'string' ? photo : photo.id;
  const q = new URLSearchParams();
  if (shareToken) q.set('s', shareToken);
  if (typeof photo !== 'string' && photo.rot && kind !== 'original') q.set('r', String(photo.rot));
  const qs = q.toString();
  return `/media/${id}/${kind}${qs ? `?${qs}` : ''}`;
}

const hashCache = new Map<string, string>();
export function placeholder(hash: string | null): string | undefined {
  if (!hash) return undefined;
  let url = hashCache.get(hash);
  if (!url) {
    try {
      const bin = atob(hash);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      url = thumbHashToDataURL(bytes);
      hashCache.set(hash, url);
    } catch {
      return undefined;
    }
  }
  return url;
}

/**
 * La foto con su borde de papel. Mientras carga muestra la imagen "latente"
 * (thumbhash) y cuando llega se revela.
 */
export const PhotoImage = function PhotoImage({
  photo, kind = 'thumb', shareToken, eager, developMs = 1100, stamp,
}: { photo: LocalPhoto; kind?: 'thumb' | 'display'; shareToken?: string; eager?: boolean; developMs?: number; stamp?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const ready = photo.status === 'ready';
  const src = ready ? mediaUrl(photo, kind, shareToken) : photo.local?.url;
  const bg = useMemo(() => placeholder(photo.thumbhash), [photo.thumbhash]);

  useEffect(() => {
    const img = ref.current;
    if (!img || !ready) return;
    if (img.complete && img.naturalWidth) return;
    const t0 = performance.now();
    const onLoad = () => {
      if (performance.now() - t0 > 60) develop(img, photo.local ? 2600 : developMs);
    };
    img.addEventListener('load', onLoad, { once: true });
    return () => img.removeEventListener('load', onLoad);
  }, [src, ready, developMs, photo.local]);

  return (
    <div className={`photo${!ready ? ' latent' : ''}`} style={{ ['--ar' as string]: aspect(photo), ['--c' as string]: photo.color ?? '#8a8f92', backgroundImage: bg ? `url(${bg})` : undefined }}>
      {src && <img ref={ref} src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} />}
      {stamp && ready && photo.takenAt && <DateStamp date={photo.takenAt} />}
    </div>
  );
};

type PrintProps = React.HTMLAttributes<HTMLDivElement> & {
  photo: LocalPhoto;
  shareToken?: string;
  stamp?: boolean;
  eager?: boolean;
};

export const Print = forwardRef<HTMLDivElement, PrintProps>(function Print({ photo, shareToken, stamp, eager, className = '', children, ...rest }, ref) {
  return (
    <div ref={ref} className={`print ${className}`} data-id={photo.id} {...rest}>
      <div className="paper">
        <PhotoImage photo={photo} shareToken={shareToken} eager={eager} stamp={stamp} />
        <span className="gloss" />
        {children}
      </div>
    </div>
  );
});
