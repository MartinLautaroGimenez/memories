'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fmtDate, fmtTime, MONTHS, plural } from '@/lib/format';
import { IconMore } from './icons';
import { EASE, reducedMotion } from './motion';
import { aspect, mediaUrl, placeholder, type LocalPhoto } from './Print';
import { Sheet } from './Sheet';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/* ---------- Encabezado de día ---------- */

export function DayHead({ n, date, note, canEdit, onSave }: { n: number; date: string; note: string; canEdit: boolean; onSave: (note: string) => void }) {
  const [editing, setEditing] = useState(false);
  const d = new Date(`${date}T00:00:00Z`);
  const label = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
  return (
    <div className="day-head">
      <h2 className="day-num">Día {n}</h2>
      <span className="day-date">{label}</span>
      {editing ? (
        <input
          className="day-note-input"
          autoFocus
          defaultValue={note}
          maxLength={80}
          aria-label={`Título del día ${n}`}
          placeholder="Por ejemplo: la cascada"
          onBlur={e => { setEditing(false); if (e.target.value.trim() !== note) onSave(e.target.value.trim()); }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { (e.target as HTMLInputElement).value = note; (e.target as HTMLInputElement).blur(); }
          }}
        />
      ) : note ? (
        canEdit ? <button className="day-note" type="button" onClick={() => setEditing(true)} aria-label={`Cambiar el título del día ${n}: ${note}`}>{note}</button> : <span className="day-note">{note}</span>
      ) : (
        canEdit && <button className="day-note add" type="button" onClick={() => setEditing(true)}>Escribí un título</button>
      )}
    </div>
  );
}

/** Agrupa por día (hora de reloj de la cámara) y numera desde el primer día. */
export function dayGroups(photos: LocalPhoto[]) {
  const dated = photos.filter(p => p.status === 'ready' && p.takenAt);
  const days = [...new Set(dated.map(p => p.takenAt!.slice(0, 10)))].sort();
  if (days.length < 2) return null;
  const first = Date.parse(`${days[0]}T00:00:00Z`);
  const firstOfDay = new Map<string, string>();
  for (const p of photos) {
    if (p.status !== 'ready' || !p.takenAt) continue;
    const day = p.takenAt.slice(0, 10);
    if (!firstOfDay.has(day)) firstOfDay.set(day, p.id);
  }
  return [...firstOfDay].map(([date, id]) => ({ date, id, n: Math.round((Date.parse(`${date}T00:00:00Z`) - first) / 86400000) + 1 }));
}

/* ---------- Menú "más" ---------- */

export function MoreMenu({ items }: { items: { label: string; onClick: () => void; hidden?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const visible = items.filter(i => !i.hidden);
  if (!visible.length) return null;
  return (
    <div className="menu-wrap" ref={wrap}>
      <button className="icon-btn" type="button" aria-label="Más opciones del álbum" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <IconMore />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-links">
            {visible.map(i => (
              <button key={i.label} type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); i.onClick(); }}>
                {i.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Barra de selección ---------- */

export function SelectionBar(props: {
  count: number; total: number; zipHref: string | null; canFav: boolean; canEdit: boolean; canDelete: boolean;
  onAll: () => void; onNone: () => void; onFav: () => void; onShift: () => void; onDelete: () => void; onDone: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const none = props.count === 0;
  return (
    <div className="selbar" role="toolbar" aria-label="Fotos elegidas">
      <span className="sel-count" aria-live="polite">{none ? 'Tocá las fotos para elegirlas' : plural(props.count, 'foto elegida', 'fotos elegidas')}</span>
      {confirm ? (
        <>
          <span className="sel-warn">Se borran para todas las personas del álbum.</span>
          <button className="btn danger" type="button" onClick={() => { setConfirm(false); props.onDelete(); }}>Borrar {props.count}</button>
          <button className="btn ghost" type="button" onClick={() => setConfirm(false)}>Cancelar</button>
        </>
      ) : (
        <>
          <button className="btn ghost" type="button" onClick={props.count === props.total ? props.onNone : props.onAll}>
            {props.count === props.total ? 'Ninguna' : 'Todas'}
          </button>
          {props.canFav && <button className="btn ghost" type="button" disabled={none} onClick={props.onFav}>Favoritas</button>}
          {props.zipHref && (none ? <button className="btn ghost" type="button" disabled>Descargar</button> : <a className="btn ghost" href={props.zipHref} download>Descargar</a>)}
          {props.canEdit && <button className="btn ghost" type="button" disabled={none} onClick={props.onShift}>Corregir hora</button>}
          {props.canDelete && <button className="btn ghost" type="button" disabled={none} onClick={() => setConfirm(true)}>Borrar</button>}
          <button className="btn" type="button" onClick={props.onDone}>Listo</button>
        </>
      )}
    </div>
  );
}

/* ---------- Corregir la hora ---------- */

export type ShiftScope = { ids?: string[]; by?: string; camera?: string; all?: true };

export function ShiftSheet({ photos, selected, mine, onApply, onClose }: {
  photos: LocalPhoto[];
  selected: string[];
  /** Si no administra, solo puede tocar sus fotos. */
  mine: string | null;
  onApply: (scope: ShiftScope, minutes: number | 'reset') => Promise<boolean>;
  onClose: () => void;
}) {
  const own = useMemo(() => photos.filter(p => p.status === 'ready' && p.takenAt && (!mine || p.by?.id === mine)), [photos, mine]);
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of own) {
      if (p.by) m.set(p.by.id, p.by.name);
      else if (p.guestName) m.set(`guest:${p.guestName}`, `${p.guestName} (sin cuenta)`);
    }
    return [...m];
  }, [own]);
  const cameras = useMemo(() => [...new Set(own.map(p => p.camera ?? ''))], [own]);

  const [mode, setMode] = useState<'sel' | 'by' | 'camera' | 'all'>(selected.length ? 'sel' : people.length > 1 ? 'by' : 'all');
  const [by, setBy] = useState(people[0]?.[0] ?? '');
  const [camera, setCamera] = useState(cameras[0] ?? '');
  const [sign, setSign] = useState<1 | -1>(1);
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(1);
  const [mins, setMins] = useState(0);
  const [busy, setBusy] = useState(false);

  const affected = own.filter(p =>
    mode === 'sel' ? selected.includes(p.id) : mode === 'by' ? (by.startsWith('guest:') ? p.guestName === by.slice(6) : p.by?.id === by) : mode === 'camera' ? (p.camera ?? '') === camera : true,
  );
  const minutes = sign * (days * 1440 + hours * 60 + mins);
  const scope: ShiftScope = mode === 'sel' ? { ids: selected } : mode === 'by' ? { by } : mode === 'camera' ? { camera } : { all: true };
  if (mine) scope.by = scope.by ?? mine;
  const sample = affected[0];
  const after = sample?.takenAt ? new Date(Date.parse(sample.takenAt) + minutes * 60000) : null;
  const canReset = affected.some(p => p.exifTakenAt && p.exifTakenAt !== p.takenAt);

  async function apply(m: number | 'reset') {
    setBusy(true);
    const ok = await onApply(scope, m);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet title="Corregir la hora" sub="Sirve cuando una cámara tenía mal la hora o la zona horaria. Las fotos se reacomodan solas." onClose={onClose}>
      <fieldset className="choice">
        <legend>Qué fotos</legend>
        {selected.length > 0 && (
          <label><input type="radio" name="scope" checked={mode === 'sel'} onChange={() => setMode('sel')} /> Las {plural(selected.length, 'foto elegida', 'fotos elegidas')}</label>
        )}
        {people.length > 0 && (
          <label>
            <input type="radio" name="scope" checked={mode === 'by'} onChange={() => setMode('by')} /> Todas las de
            <select value={by} onChange={e => { setBy(e.target.value); setMode('by'); }} aria-label="Persona">
              {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        )}
        {cameras.length > 1 && (
          <label>
            <input type="radio" name="scope" checked={mode === 'camera'} onChange={() => setMode('camera')} /> Todas las de la cámara
            <select value={camera} onChange={e => { setCamera(e.target.value); setMode('camera'); }} aria-label="Cámara">
              {cameras.map(c => <option key={c} value={c}>{c || 'Sin datos de cámara'}</option>)}
            </select>
          </label>
        )}
        <label><input type="radio" name="scope" checked={mode === 'all'} onChange={() => setMode('all')} /> {mine ? 'Todas las que subiste' : 'Todo el álbum'}</label>
      </fieldset>

      <fieldset className="choice">
        <legend>Cuánto mover</legend>
        <div className="shift-row">
          <div className="seg small" role="group" aria-label="Sentido">
            <button type="button" aria-pressed={sign === 1} onClick={() => setSign(1)}>Adelantar</button>
            <button type="button" aria-pressed={sign === -1} onClick={() => setSign(-1)}>Atrasar</button>
          </div>
          <label className="num"><input className="input" type="number" min={0} max={3650} value={days} onChange={e => setDays(Math.max(0, +e.target.value || 0))} /> días</label>
          <label className="num"><input className="input" type="number" min={0} max={23} value={hours} onChange={e => setHours(Math.max(0, +e.target.value || 0))} /> horas</label>
          <label className="num"><input className="input" type="number" min={0} max={59} value={mins} onChange={e => setMins(Math.max(0, +e.target.value || 0))} /> min</label>
        </div>
        {sample?.takenAt && after && (
          <p className="hint">
            Por ejemplo, {sample.file}: {fmtDate(sample.takenAt)} {fmtTime(sample.takenAt)} pasa a {fmtDate(after)} {fmtTime(after)}.
          </p>
        )}
      </fieldset>

      <div className="form-actions">
        <button className="btn" type="button" disabled={busy || !affected.length || minutes === 0} onClick={() => apply(minutes)}>
          Corregir {plural(affected.length, 'foto', 'fotos')}
        </button>
        {canReset && (
          <button className="link-btn" type="button" disabled={busy} onClick={() => apply('reset')}>
            Volver a la hora original de la cámara
          </button>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Ordenar a mano ---------- */

export function Reorder({ photos, shareToken, onSave, onCancel }: { photos: LocalPhoto[]; shareToken?: string; onSave: (ids: string[]) => void; onCancel: () => void }) {
  const [order, setOrder] = useState(() => photos.map(p => p.id));
  const byId = useMemo(() => new Map(photos.map(p => [p.id, p])), [photos]);
  const grid = useRef<HTMLOListElement>(null);
  const rects = useRef(new Map<string, DOMRect>());
  const drag = useRef<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const snapshot = () => {
    rects.current.clear();
    grid.current?.querySelectorAll<HTMLElement>('[data-id]').forEach(el => rects.current.set(el.dataset.id!, el.getBoundingClientRect()));
  };

  // FLIP: las demás copias se corren suavemente a su lugar nuevo
  useLayoutEffect(() => {
    if (reducedMotion() || !rects.current.size) return;
    grid.current?.querySelectorAll<HTMLElement>('[data-id]').forEach(el => {
      const before = rects.current.get(el.dataset.id!);
      if (!before || el.dataset.id === drag.current?.id) return;
      const now = el.getBoundingClientRect();
      const dx = before.left - now.left, dy = before.top - now.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 260, easing: EASE });
    });
    rects.current.clear();
  }, [order]);

  const move = (id: string, to: number) => {
    setOrder(o => {
      const from = o.indexOf(id);
      if (from < 0 || to === from || to < 0 || to >= o.length) return o;
      snapshot();
      const next = [...o];
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  };

  function onPointerDown(e: React.PointerEvent<HTMLLIElement>, id: string) {
    if (e.button > 0) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    drag.current = { id, dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
    setDragging(id);
  }
  function onPointerMove(e: React.PointerEvent<HTMLLIElement>) {
    const d = drag.current;
    if (!d) return;
    const el = e.currentTarget;
    const base = el.getBoundingClientRect();
    const cur = new DOMMatrix(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
    const left0 = base.left - cur.m41, top0 = base.top - cur.m42;
    el.style.transform = `translate(${e.clientX - d.dx - left0}px,${e.clientY - d.dy - top0}px) scale(1.06)`;
    const target = [...(grid.current?.querySelectorAll<HTMLElement>('[data-id]') ?? [])].find(c => {
      if (c === el) return false;
      const b = c.getBoundingClientRect();
      return e.clientX > b.left && e.clientX < b.right && e.clientY > b.top && e.clientY < b.bottom;
    });
    if (target) move(d.id, order.indexOf(target.dataset.id!));
  }
  function onPointerUp(e: React.PointerEvent<HTMLLIElement>) {
    if (!drag.current) return;
    const el = e.currentTarget;
    const from = el.style.transform;
    el.style.transform = '';
    if (!reducedMotion() && from) el.animate([{ transform: from }, { transform: 'none' }], { duration: 220, easing: EASE });
    drag.current = null;
    setDragging(null);
  }

  return (
    <div className="reorder">
      <div className="reorder-bar">
        <p>Arrastrá las fotos para cambiar el orden. Con el teclado: elegí una con Tab y movela con las flechas.</p>
        <div className="form-actions">
          <button className="btn" type="button" onClick={() => onSave(order)}>Guardar orden</button>
          <button className="btn ghost" type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
      <ol className="reorder-grid" ref={grid}>
        {order.map((id, i) => {
          const p = byId.get(id)!;
          const bg = placeholder(p.thumbhash);
          return (
            <li
              key={id}
              data-id={id}
              className={`reorder-cell${dragging === id ? ' dragging' : ''}`}
              tabIndex={0}
              aria-label={`Foto ${i + 1} de ${order.length}${p.note ? `: ${p.note}` : ''}`}
              onPointerDown={e => onPointerDown(e, id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={e => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(id, i - 1); }
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(id, i + 1); }
              }}
            >
              <span className="reorder-num">{i + 1}</span>
              <span className="reorder-paper">
                <span className="reorder-photo" style={{ ['--ar' as string]: aspect(p), backgroundImage: bg ? `url(${bg})` : undefined }}>
                  <img src={mediaUrl(p.id, 'thumb', shareToken)} alt="" draggable={false} loading="lazy" />
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
