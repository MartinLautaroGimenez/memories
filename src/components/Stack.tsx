'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { monthYear, plural } from '@/lib/format';
import type { AlbumCardDTO, PhotoDTO } from '@/lib/types';
import { Avatars } from './Avatars';
import { setFlip } from './handoff';
import { rng, tiltRelease, tiltTo } from './motion';
import { aspect, Print } from './Print';

const width = (p: PhotoDTO) => {
  const ar = aspect(p);
  return ar > 1.15 ? '82%' : ar < 0.87 ? '55%' : '64%';
};

/** Un álbum sobre la mesa: la portada arriba y dos copias que asoman debajo. */
export function Stack({ card, meId }: { card: AlbumCardDTO; meId: string }) {
  const box = useRef<HTMLDivElement>(null);
  const r = rng(card.id);
  const rot = [r() * 5 - 2.5, -(3 + r() * 4), 3 + r() * 4];
  const [p0, p1, p2] = card.preview;

  function capture() {
    const prints = [...(box.current?.querySelectorAll<HTMLElement>('.print[data-id]') ?? [])];
    setFlip(
      prints.map(el => {
        const rect = el.getBoundingClientRect();
        const r0 = parseFloat(el.style.getPropertyValue('--r0')) || 0;
        return { id: el.dataset.id!, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, w: el.offsetWidth, rot: r0 };
      }),
    );
  }

  const style = (p: PhotoDTO, deg: number) => ({ ['--w' as string]: width(p), ['--r0' as string]: `${deg.toFixed(1)}deg` });
  const label = `${card.title}, ${plural(card.count, 'foto', 'fotos')}`;

  return (
    <Link
      className="stack"
      href={`/a/${card.slug}`}
      aria-label={label}
      onClick={capture}
      onPointerMove={e => e.pointerType === 'mouse' && box.current && tiltTo(e.currentTarget, box.current, e, 7)}
      onPointerLeave={() => tiltRelease(box.current)}
    >
      <div className="stack-box" ref={box}>
        {p2 && <Print photo={p2} className="u2" style={style(p2, rot[2])} />}
        {p1 && <Print photo={p1} className="u1" style={style(p1, rot[1])} />}
        {p0 ? (
          <Print photo={p0} className="cover" style={style(p0, rot[0])} stamp eager />
        ) : (
          <div className="print cover empty-print" style={{ ['--w' as string]: '70%', ['--r0' as string]: `${rot[0].toFixed(1)}deg` }}>
            <div className="paper">
              <div className="photo" style={{ ['--ar' as string]: 1.5 }} />
              <p className="print-note">Todavía sin fotos</p>
            </div>
          </div>
        )}
      </div>
      <div className="stack-label">
        <div>
          <h2 className="stack-title">{card.title}</h2>
          <p className="stack-meta">
            {card.place && (
              <>
                {card.place}
                <br />
              </>
            )}
            {plural(card.count, 'foto', 'fotos')}
            {card.from ? `, ${monthYear(card.from)}` : ''}
          </p>
        </div>
        <Avatars people={card.people} meId={meId} />
      </div>
    </Link>
  );
}
