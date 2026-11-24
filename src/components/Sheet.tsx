'use client';

import { useEffect, useId, useRef } from 'react';
import { IconClose } from './icons';
import { EASE, reducedMotion } from './motion';

/** Diálogo con forma de tarjeta de papel. En el celu sube desde abajo. */
export function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const id = useId();
  const card = useRef<HTMLDivElement>(null);
  const back = useRef<Element | null>(null);

  useEffect(() => {
    back.current = document.activeElement;
    const el = card.current!;
    if (!reducedMotion()) {
      const narrow = window.innerWidth <= 560;
      el.animate(
        narrow ? [{ transform: 'translateY(100%)' }, { transform: 'none' }] : [{ transform: 'translateY(16px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 420, easing: EASE },
      );
    }
    const first = el.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea,button:not(.sheet-close)');
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') trap(e, el);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      (back.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet-card" ref={card}>
        <button className="icon-btn sheet-close" type="button" aria-label="Cerrar" onClick={onClose}>
          <IconClose />
        </button>
        <h2 id={id}>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function trap(e: KeyboardEvent, box: HTMLElement) {
  const f = [...box.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
