'use client';

import { useEffect, useState } from 'react';
import { reducedMotion } from './motion';

/** El interruptor de la mesa de luz. Apagado = cuarto oscuro. */
export function LightSwitch() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setOn(root.dataset.theme ? root.dataset.theme === 'light' : !mq.matches);
    sync();
    mq.addEventListener('change', sync);
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', sync);
      mo.disconnect();
    };
  }, []);

  function toggle() {
    const toDark = on;
    const theme = toDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
    const fx = document.getElementById('fx');
    if (!fx || reducedMotion()) return;
    fx.animate(
      toDark
        ? [{ opacity: 1 }, { opacity: 0.85, offset: 0.35 }, { opacity: 0 }]
        : [{ opacity: 1 }, { opacity: 0, offset: 0.1 }, { opacity: 0.7, offset: 0.17 }, { opacity: 0, offset: 0.28 }, { opacity: 0.35, offset: 0.36 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }],
      { duration: toDark ? 1100 : 760, easing: 'linear' },
    );
  }

  return (
    <button className="lightswitch" type="button" role="switch" aria-checked={on} aria-label="Luz de la mesa" onClick={toggle}>
      <span className="ls-plate" aria-hidden="true">
        <span className="ls-rocker" />
        <span className="ls-led" />
      </span>
      <span className="ls-text" aria-hidden="true">
        Luz
      </span>
    </button>
  );
}
