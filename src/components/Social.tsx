'use client';

import { useEffect, useRef, useState } from 'react';
import type { CommentDTO, PhotoDTO, ReactionKind } from '@/lib/types';
import { Avatar } from './Avatars';
import { IconClose, IconHeart } from './icons';

const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const IconLaugh = () => (<svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M8.2 10.2q1-1 2 0M13.8 10.2q1-1 2 0" /><path d="M8 13.5h8a4 4 0 0 1-8 0z" fill="currentColor" fillOpacity=".25" /></svg>);
const IconWow = () => (<svg {...base}><circle cx="12" cy="12" r="8.5" /><circle cx="9.3" cy="10" r=".9" fill="currentColor" /><circle cx="14.7" cy="10" r=".9" fill="currentColor" /><ellipse cx="12" cy="15" rx="1.8" ry="2.2" /></svg>);
const IconComment = () => (<svg {...base}><path d="M5 5.5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4.5 3.5V16.5H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" /></svg>);

export const REACTION_UI: { kind: ReactionKind; label: string; Icon: (p: { filled?: boolean }) => React.ReactElement }[] = [
  { kind: 'heart', label: 'Me encanta', Icon: IconHeart },
  { kind: 'laugh', label: 'Me hace reír', Icon: IconLaugh },
  { kind: 'wow', label: 'Me asombra', Icon: IconWow },
];

export function Reactions({ p, onReact }: { p: PhotoDTO; onReact: (kind: ReactionKind, on: boolean) => void }) {
  return (
    <div className="reactions" role="group" aria-label="Reacciones">
      {REACTION_UI.map(({ kind, label, Icon }) => {
        const mine = p.myReactions.includes(kind);
        const n = p.reactions[kind] ?? 0;
        return (
          <button key={kind} type="button" className={`reaction${mine ? ' on' : ''}`} aria-pressed={mine} aria-label={`${label}${n ? ` (${n})` : ''}`} onClick={() => onReact(kind, !mine)}>
            <Icon filled={mine} />
            {n > 0 && <span>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function CommentsButton({ n, onClick, open }: { n: number; onClick: () => void; open: boolean }) {
  return (
    <button type="button" className={`reaction comments-btn${open ? ' on' : ''}`} aria-expanded={open} onClick={onClick}>
      <IconComment />
      <span>{n ? `${n} ${n === 1 ? 'comentario' : 'comentarios'}` : 'Comentar'}</span>
    </button>
  );
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'recién';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Los comentarios de una foto, como papelitos pegados. */
export function CommentsPanel({ photoId, onCount, onClose }: { photoId: string; onCount: (n: number) => void; onClose: () => void }) {
  const [list, setList] = useState<CommentDTO[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLOListElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const countRef = useRef(onCount);
  useEffect(() => { countRef.current = onCount; });

  useEffect(() => {
    let alive = true;
    fetch(`/api/photos/${photoId}/comments`)
      .then(r => r.json())
      .then(d => { if (alive) { setList(d.comments ?? []); countRef.current(d.comments?.length ?? 0); } })
      .catch(() => alive && setError('No pudimos traer los comentarios.'));
    field.current?.focus({ preventScroll: true });
    return () => { alive = false; };
  }, [photoId]);

  useEffect(() => {
    box.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [list?.length]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body) return;
    setBusy(true);
    const res = await fetch(`/api/photos/${photoId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(d?.error ?? 'No pudimos publicar el comentario.');
    form.reset();
    setError('');
    setList(d.comments);
    onCount(d.comments.length);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) return setError('No pudimos borrar el comentario.');
    const next = (list ?? []).filter(c => c.id !== id);
    setList(next);
    onCount(next.length);
  }

  return (
    <aside className="comments" aria-label="Comentarios">
      <header className="comments-head">
        <h2>Comentarios</h2>
        <button className="icon-btn" type="button" aria-label="Cerrar comentarios" onClick={onClose}><IconClose /></button>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ol className="notes" ref={box}>
        {list === null ? (
          <li className="notes-empty">Buscando comentarios…</li>
        ) : list.length === 0 ? (
          <li className="notes-empty">Todavía nadie comentó esta foto.</li>
        ) : (
          list.map((c, i) => (
            <li key={c.id} className="note-slip" style={{ ['--tilt' as string]: `${i % 2 ? 0.8 : -0.8}deg` }}>
              <div className="slip-head">
                <Avatar name={c.author.name} color={c.author.color} />
                <span className="slip-name">{c.author.name}{c.author.guest ? ' (invitado)' : ''}</span>
                <time dateTime={c.createdAt}>{ago(c.createdAt)}</time>
                {c.canDelete && (
                  <button className="link-btn slip-del" type="button" onClick={() => remove(c.id)} aria-label={`Borrar el comentario de ${c.author.name}`}>Borrar</button>
                )}
              </div>
              <p>{c.body}</p>
            </li>
          ))
        )}
      </ol>
      <form className="comment-form" onSubmit={send}>
        <label className="sr" htmlFor="commentBody">Tu comentario</label>
        <textarea
          ref={field}
          id="commentBody"
          name="body"
          rows={2}
          maxLength={1000}
          placeholder="Escribí un comentario"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); }}
        />
        <button className="btn" type="submit" disabled={busy}>Publicar</button>
      </form>
    </aside>
  );
}
