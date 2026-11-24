import type { Exposure } from './types';

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Las fechas de las fotos son hora de reloj de la cámara: se leen siempre en UTC. */
export const d = (iso: string | Date) => (typeof iso === 'string' ? new Date(iso) : iso);

export function fmtDate(iso: string | Date): string {
  const x = d(iso);
  return `${x.getUTCDate()} de ${MONTHS[x.getUTCMonth()]} de ${x.getUTCFullYear()}`;
}

export function fmtTime(iso: string | Date): string {
  const x = d(iso);
  return `${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`;
}

export function monthYear(iso: string | Date): string {
  const x = d(iso);
  return `${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}

/** Texto del fechador: "15 6 '26" */
export function stampText(iso: string | Date): string {
  const x = d(iso);
  return `${x.getUTCDate()} ${x.getUTCMonth() + 1} '${String(x.getUTCFullYear()).slice(2)}`;
}

export function rangeText(from: string | null, to: string | null): string {
  if (!from || !to) return '';
  const f = d(from), t = d(to);
  const sameDay = f.toISOString().slice(0, 10) === t.toISOString().slice(0, 10);
  if (sameDay) return fmtDate(f);
  if (f.getUTCFullYear() === t.getUTCFullYear() && f.getUTCMonth() === t.getUTCMonth()) {
    return `${f.getUTCDate()} al ${t.getUTCDate()} de ${MONTHS[t.getUTCMonth()]} de ${t.getUTCFullYear()}`;
  }
  return `${fmtDate(f)} al ${fmtDate(t)}`;
}

export function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

/** f/1.6 1/500 ISO 50 */
export function fmtExposure(e: Exposure | null | undefined): string {
  if (!e) return '';
  const parts: string[] = [];
  if (e.fNumber) parts.push(`f/${+e.fNumber.toFixed(1)}`);
  if (e.exposureTime) parts.push(e.exposureTime >= 1 ? `${+e.exposureTime.toFixed(1)}s` : `1/${Math.round(1 / e.exposureTime)}`);
  if (e.iso) parts.push(`ISO ${e.iso}`);
  return parts.join(' ');
}

/** 63.42, -19.0 -> 63°25′N 19°00′O */
export function fmtCoords(lat: number, lng: number): string {
  const one = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    const deg = Math.floor(a);
    const min = Math.round((a - deg) * 60);
    return `${min === 60 ? deg + 1 : deg}°${String(min === 60 ? 0 : min).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
  };
  return `${one(lat, 'N', 'S')} ${one(lng, 'E', 'O')}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
