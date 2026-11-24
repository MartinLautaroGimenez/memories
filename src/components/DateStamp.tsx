import { fmtDate, stampText } from '@/lib/format';

/** Fechador de 7 segmentos, como el de las cámaras compactas. */
const SEGS: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
const SEGP: Record<string, [number, number, number, number]> = {
  a: [2.3, 1, 7.7, 1], b: [9, 2.3, 9, 7.7], c: [9, 10.3, 9, 15.7], d: [2.3, 17, 7.7, 17],
  e: [1, 10.3, 1, 15.7], f: [1, 2.3, 1, 7.7], g: [2.3, 9, 7.7, 9],
};

export function stampPath(text: string) {
  let x = 0;
  let d = '';
  for (const ch of text) {
    if (ch === ' ') { x += 9; continue; }
    if (ch === "'") { d += `M${x + 2.4} 1L${x + 1.5} 4.8`; x += 5.5; continue; }
    for (const k of SEGS[ch] ?? '') {
      const [x1, y1, x2, y2] = SEGP[k];
      d += `M${(x + x1).toFixed(1)} ${y1}L${(x + x2).toFixed(1)} ${y2}`;
    }
    x += 13;
  }
  return { d, w: x + 1 };
}

export function DateStamp({ date, className = 'stamp' }: { date: string | Date; className?: string }) {
  const { d, w } = stampPath(stampText(date));
  return (
    <svg className={className} viewBox={`-3.5 -1 ${w.toFixed(1)} 20`} style={{ aspectRatio: `${w.toFixed(1)} / 20` }} role="img" aria-label={fmtDate(date)}>
      <path d={d} transform="skewX(-7)" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" />
    </svg>
  );
}
