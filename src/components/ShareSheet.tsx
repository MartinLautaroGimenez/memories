'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fmtDate } from '@/lib/format';
import type { PersonDTO, Role, ShareSettingsDTO } from '@/lib/types';
import { Avatar } from './Avatars';
import { IconClose } from './icons';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

const ROLE_LABEL: Record<Role, string> = { owner: 'Administra', contributor: 'Sube fotos', viewer: 'Solo mira' };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok) throw new Error(data?.error ?? 'No pudimos guardar el cambio. Revisá tu conexión.');
  return data;
}

export function ShareSheet({ album, meId, onClose }: { album: { id: string; title: string; people: PersonDTO[] }; meId: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState<ShareSettingsDTO | null>(null);
  const [error, setError] = useState('');
  const [askPass, setAskPass] = useState(false);
  const base = `/api/albums/${album.id}`;

  useEffect(() => {
    call(`${base}/share`, 'GET').then(setS).catch(e => setError(e.message));
  }, [base]);

  async function run(fn: () => Promise<unknown>, done?: string, optimistic?: (s: ShareSettingsDTO) => ShareSettingsDTO) {
    setError('');
    const before = s;
    if (optimistic && s) setS(optimistic(s));
    try {
      const r = await fn();
      if (r && typeof r === 'object' && ('link' in r || 'invite' in r)) setS(r as ShareSettingsDTO);
      if (done) toast(done);
      return true;
    } catch (e) {
      setS(before);
      setError((e as Error).message);
      return false;
    }
  }

  const setLink = (enabled: boolean) =>
    run(
      () => call(`${base}/share`, 'POST', { link: { enabled } }),
      enabled ? 'Link público activado' : 'Link público desactivado',
      cur => ({ ...cur, link: enabled ? { url: '', hasPassword: false, allowDownload: true, allowUpload: false } : null }),
    );

  async function copy(text: string, inputId: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Link copiado');
    } catch {
      const el = document.getElementById(inputId) as HTMLInputElement | null;
      el?.focus();
      el?.select();
      toast('Seleccioné el link: copialo con Ctrl+C');
    }
  }

  const link = s?.link;

  return (
    <Sheet title={`Compartir ${album.title}`} sub="Las personas del álbum ven todo y pueden subir fotos. El link público es para que otros solo miren." onClose={onClose}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <h3>Personas en este álbum</h3>
      <ul className="members">
        {album.people.map(p => (
          <li key={p.id}>
            <Avatar name={p.name} color={p.color} />
            <span className="name">{p.id === meId ? `${p.name} (vos)` : p.name}</span>
            {p.id === meId ? (
              <span className="role">{ROLE_LABEL[p.role]}</span>
            ) : (
              <>
                <select
                  aria-label={`Permiso de ${p.name}`}
                  defaultValue={p.role}
                  onChange={e => run(() => call(`${base}/members/${p.id}`, 'PATCH', { role: e.target.value }), 'Permiso cambiado').then(ok => ok && router.refresh())}
                >
                  {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button className="x" type="button" aria-label={`Sacar a ${p.name} del álbum`} onClick={() => run(() => call(`${base}/members/${p.id}`, 'DELETE'), `${p.name.split(' ')[0]} ya no está en el álbum`).then(ok => ok && router.refresh())}>
                  <IconClose />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <h3>Invitar a quienes estuvieron</h3>
      {s?.invite ? (
        <>
          <div className="linkrow">
            <input className="input" id="inviteLink" type="text" readOnly value={s.invite.url} aria-label="Link de invitación" />
            <button className="btn" type="button" onClick={() => copy(s.invite!.url, 'inviteLink')}>
              Copiar link
            </button>
          </div>
          <p className="hint">
            Quien lo abra crea su cuenta y puede subir fotos. Vence el {fmtDate(s.invite.expiresAt)}.{' '}
            <button className="link-btn" type="button" onClick={() => run(() => call(`${base}/share`, 'POST', { invite: { renew: true } }), 'Link nuevo creado')}>
              Crear uno nuevo
            </button>
          </p>
        </>
      ) : (
        <button className="btn" type="button" disabled={!s} onClick={() => run(() => call(`${base}/share`, 'POST', { invite: {} }), 'Link de invitación creado')}>
          Crear link de invitación
        </button>
      )}

      {s?.mail && (
        <form
          className="linkrow"
          style={{ marginTop: 12 }}
          onSubmit={e => {
            e.preventDefault();
            const form = e.currentTarget;
            const email = String(new FormData(form).get('email') ?? '').trim();
            run(() => call(`${base}/share`, 'POST', { inviteEmail: email }), `Invitación mandada a ${email}`).then(ok => ok && form.reset());
          }}
        >
          <input className="input" name="email" type="email" required placeholder="email@ejemplo.com" aria-label="Email de la persona a invitar" autoComplete="off" />
          <button className="btn" type="submit">Invitar por mail</button>
        </form>
      )}

      <h3>Link para ver</h3>
      <label className="toggle" htmlFor="tgPublic">
        Cualquiera con el link puede ver
        <input type="checkbox" id="tgPublic" checked={!!link} disabled={!s} onChange={e => setLink(e.target.checked)} />
      </label>
      {link && (
        <>
          <div className="linkrow" style={{ marginTop: 10 }}>
            <input className="input" id="shareLink" type="text" readOnly value={link.url} placeholder="Creando el link…" aria-label="Link público del álbum" />
            <button className="btn" type="button" disabled={!link.url} onClick={() => copy(link.url, 'shareLink')}>
              Copiar link
            </button>
          </div>
          <label className="toggle" htmlFor="tgPass">
            Pedir contraseña
            <input
              type="checkbox"
              id="tgPass"
              checked={link.hasPassword || askPass}
              onChange={e => {
                if (e.target.checked) setAskPass(true);
                else { setAskPass(false); run(() => call(`${base}/share`, 'POST', { link: { enabled: true, password: null } }), 'Ya no pide contraseña'); }
              }}
            />
          </label>
          {askPass && !link.hasPassword && (
            <form
              className="linkrow"
              style={{ marginTop: 10 }}
              onSubmit={e => {
                e.preventDefault();
                const v = String(new FormData(e.currentTarget).get('pass') ?? '');
                run(() => call(`${base}/share`, 'POST', { link: { enabled: true, password: v } }), 'Contraseña guardada').then(ok => ok && setAskPass(false));
              }}
            >
              <input className="input" name="pass" type="text" minLength={4} required placeholder="Al menos 4 caracteres" aria-label="Contraseña del link" autoComplete="off" />
              <button className="btn" type="submit">
                Guardar
              </button>
            </form>
          )}
          <label className="toggle" htmlFor="tgDl">
            Permitir descargar originales
            <input
              type="checkbox"
              id="tgDl"
              checked={link.allowDownload}
              onChange={e => {
                const v = e.target.checked;
                run(() => call(`${base}/share`, 'POST', { link: { enabled: true, allowDownload: v } }), undefined, cur => ({ ...cur, link: cur.link && { ...cur.link, allowDownload: v } }));
              }}
            />
          </label>
          {s?.guestUploads && (
            <>
              <label className="toggle" htmlFor="tgUp">
                Los invitados pueden subir fotos sin cuenta
                <input
                  type="checkbox"
                  id="tgUp"
                  checked={link.allowUpload}
                  onChange={e => {
                    const v = e.target.checked;
                    run(
                      () => call(`${base}/share`, 'POST', { link: { enabled: true, allowUpload: v } }),
                      v ? 'Los invitados ya pueden subir fotos' : 'El link volvió a ser solo para mirar',
                      cur => ({ ...cur, link: cur.link && { ...cur.link, allowUpload: v } }),
                    );
                  }}
                />
              </label>
              <p className="hint">Ideal para casamientos y cumpleaños: cada invitado pone su nombre y sube sus fotos desde el celu.</p>
            </>
          )}
          {link.url && <QrBlock url={link.url} upload={link.allowUpload} title={album.title} />}
        </>
      )}
    </Sheet>
  );
}

export function SettingsSheet({ album, isOwner, meId, onClose }: { album: { id: string; title: string; place: string; showMap: boolean; mapsEnabled: boolean }; isOwner: boolean; meId: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await call(`/api/albums/${album.id}`, 'PATCH', { title: fd.get('title'), place: fd.get('place'), ...(album.mapsEnabled ? { showMap: fd.get('showMap') === 'on' } : {}) });
      toast('Cambios guardados');
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await call(isOwner ? `/api/albums/${album.id}` : `/api/albums/${album.id}/members/${meId}`, 'DELETE');
      toast(isOwner ? 'Álbum borrado' : 'Saliste del álbum');
      router.push('/');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet title={isOwner ? 'Editar álbum' : album.title} sub={isOwner ? undefined : 'Si salís, el álbum deja de estar en tu mesa. Las fotos que subiste quedan para el resto.'} onClose={onClose}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {isOwner && (
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="eTitle">Nombre</label>
            <input className="input" id="eTitle" name="title" required maxLength={120} defaultValue={album.title} />
          </div>
          <div className="field">
            <label htmlFor="ePlace">Lugar</label>
            <input className="input" id="ePlace" name="place" maxLength={160} defaultValue={album.place} />
          </div>
          {album.mapsEnabled && (
            <div className="setting">
              <label className="toggle" htmlFor="eMap">
                <span>Mostrar el mapa del álbum</span>
                <input type="checkbox" id="eMap" name="showMap" defaultChecked={album.showMap} />
              </label>
              <p className="hint">Muestra dónde se sacó cada foto, si el celular guardó la ubicación. Apagalo si preferís no compartir lugares exactos (por ejemplo, tu casa).</p>
            </div>
          )}
          <div className="form-actions">
            <button className="btn" type="submit" disabled={busy}>
              Guardar cambios
            </button>
          </div>
        </form>
      )}
      <h3>{isOwner ? 'Borrar el álbum' : 'Salir del álbum'}</h3>
      {confirm ? (
        <>
          <p className="hint" style={{ marginBottom: 10 }}>
            {isOwner ? 'Se borran todas las fotos y nadie más va a poder verlas. No se puede deshacer.' : 'Para volver vas a necesitar otra invitación.'}
          </p>
          <div className="form-actions">
            <button className="btn danger" type="button" disabled={busy} onClick={remove}>
              {isOwner ? 'Sí, borrar el álbum' : 'Sí, salir'}
            </button>
            <button className="btn ghost" type="button" onClick={() => setConfirm(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <button className="btn ghost" type="button" onClick={() => setConfirm(true)}>
          {isOwner ? 'Borrar álbum' : 'Salir del álbum'}
        </button>
      )}
    </Sheet>
  );
}

/** Código QR del link público, para mostrar en pantalla o imprimir en una tarjeta. */
function QrBlock({ url, upload, title }: { url: string; upload: boolean; title: string }) {
  const [svg, setSvg] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    import('qrcode').then(QR => QR.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#172024', light: '#ffffff' } })).then(s => alive && setSvg(s));
    return () => { alive = false; };
  }, [url, open]);
  async function download() {
    const QR = await import('qrcode');
    const a = document.createElement('a');
    a.href = await QR.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
    a.download = `QR ${title}.png`;
    a.click();
  }
  const token = url.split('/s/')[1];
  if (!open) return <button className="btn ghost" type="button" style={{ marginTop: 14 }} onClick={() => setOpen(true)}>Mostrar código QR</button>;
  return (
    <div className="qr-block">
      <div className="qr" role="img" aria-label={`Código QR de ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="qr-side">
        <p className="hint" style={{ marginTop: 0 }}>{upload ? 'Quien lo escanee puede ver el álbum y subir sus fotos.' : 'Quien lo escanee puede ver el álbum.'}</p>
        <div className="form-actions">
          <button className="btn ghost" type="button" onClick={download}>Descargar QR</button>
          {token && <a className="btn ghost" href={`/s/${token}/tarjeta`} target="_blank" rel="noopener">Imprimir tarjeta</a>}
        </div>
      </div>
    </div>
  );
}
