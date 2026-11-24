'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { Avatar } from '@/components/Avatars';
import { Field, Result } from '@/components/FormBits';
import { avatarColor } from '@/lib/people';
import type { AdminUser, StorageStats } from '@/server/admin';
import {
  createUserAction, deleteUserAction, forgetFacesAction, removeSmtpAction, resetPasswordAction, saveSmtpAction, setRoleAction, testSmtpAction,
  toggleSettingAction, type AdminResult,
} from './actions';

export const bytes = (n: number) => {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
};

type Features = { maps: boolean; faces: boolean; guestUploads: boolean };
type Smtp = { host: string; port: number; secure: boolean; user: string; pass: string; from: string } | null;
type FacesInfo = {
  models: { state: 'missing' | 'downloading' | 'ready' | 'error'; progress?: number; error?: string };
  running: boolean; total: number; scanned: number; faces: number; people: number; dir: string;
};

export function AdminPanel(props: {
  meId: string; users: AdminUser[]; solo: Record<string, number>; storage: StorageStats; features: Features; smtp: Smtp; envSmtp: boolean; faces: FacesInfo;
}) {
  const [msg, setMsg] = useState<AdminResult>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<AdminResult>) => start(async () => setMsg(await fn()));

  return (
    <div className="panels">
      <section className="panel wide" aria-labelledby="cuentas">
        <h2 id="cuentas">Cuentas</h2>
        <Result state={msg} />
        <ul className="accounts">
          {props.users.map(u => (
            <Account key={u.id} u={u} me={u.id === props.meId} solo={props.solo[u.id] ?? 0} busy={pending} run={run} />
          ))}
        </ul>
        <NewAccount mail={!!props.smtp || props.envSmtp} />
      </section>

      <section className="panel" aria-labelledby="espacio">
        <h2 id="espacio">Espacio</h2>
        <Storage s={props.storage} />
      </section>

      <section className="panel" aria-labelledby="funciones">
        <h2 id="funciones">Funciones</h2>
        <Toggle k="maps" on={props.features.maps} label="Mapas y Atlas" hint="El mapa de cada álbum usa teselas de OpenStreetMap: el navegador las pide a sus servidores. El Atlas se dibuja sin servicios externos." run={run} />
        <Toggle k="faces" on={props.features.faces} label="Reconocimiento facial" hint="Busca caras al revelar cada foto, todo dentro de este servidor. La primera vez descarga dos modelos chicos (unos 40 MB) y usa CPU." run={run} />
        {(props.features.faces || props.faces.faces > 0 || props.faces.people > 0) && <FacesStatus on={props.features.faces} f={props.faces} busy={pending} run={run} />}
        <Toggle k="guestUploads" on={props.features.guestUploads} label="Subidas de invitados" hint="Permite que los links públicos acepten fotos de gente sin cuenta, si quien administra el álbum lo activa." run={run} />
      </section>

      <section className="panel wide" aria-labelledby="correo">
        <h2 id="correo">Correo</h2>
        <SmtpForm smtp={props.smtp} envSmtp={props.envSmtp} />
      </section>
    </div>
  );
}

function Account({ u, me, solo, busy, run }: { u: AdminUser; me: boolean; solo: number; busy: boolean; run: (fn: () => Promise<AdminResult>) => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="account">
      <Avatar name={u.name} color={avatarColor(u.id)} />
      <div className="who">
        <p className="name">{u.name}{me ? ' (vos)' : ''}{u.role === 'admin' && <span className="tag">Administra</span>}</p>
        <p className="meta">{u.email}</p>
        <p className="meta">{u.albums} {u.albums === 1 ? 'álbum' : 'álbumes'}, {u.photos} fotos subidas, {bytes(u.bytes)}</p>
      </div>
      {!me && (
        <div className="row-actions">
          {confirm ? (
            <>
              <span className="meta">{solo ? `También se borran ${solo} álbum${solo === 1 ? '' : 'es'} que son solo suyos.` : '¿Borrar la cuenta?'}</span>
              <button className="btn danger" type="button" disabled={busy} onClick={() => { setConfirm(false); run(() => deleteUserAction(u.id)); }}>Borrar</button>
              <button className="btn ghost" type="button" onClick={() => setConfirm(false)}>Cancelar</button>
            </>
          ) : (
            <>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => run(() => resetPasswordAction(u.id, 'temp'))}>Contraseña nueva</button>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => run(() => setRoleAction(u.id, u.role === 'admin' ? 'member' : 'admin'))}>
                {u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
              </button>
              <button className="btn ghost" type="button" onClick={() => setConfirm(true)}>Borrar</button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function NewAccount({ mail }: { mail: boolean }) {
  const [state, action, pending] = useActionState(createUserAction, undefined);
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn" type="button" onClick={() => setOpen(true)}>Crear una cuenta</button>;
  return (
    <form action={action} className="inline-form">
      <h3>Cuenta nueva</h3>
      <Result state={state} />
      <div className="grid-2">
        <Field id="nu-name" name="name" label="Nombre" required maxLength={80} />
        <Field id="nu-email" name="email" label="Email" type="email" required />
      </div>
      {mail && (
        <label className="toggle" htmlFor="nu-send">
          Mandarle un mail para que elija su contraseña
          <input type="checkbox" id="nu-send" name="send" defaultChecked />
        </label>
      )}
      <p className="hint">{mail ? 'Si no mandás el mail, te mostramos una contraseña temporal para pasársela.' : 'Te mostramos una contraseña temporal para pasársela. Con el correo configurado, también le puede llegar por mail.'}</p>
      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending}>Crear cuenta</button>
        <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Cerrar</button>
      </div>
    </form>
  );
}

function Storage({ s }: { s: StorageStats }) {
  const used = s.originals + s.variants;
  const pct = s.disk ? Math.min(100, ((s.disk.total - s.disk.free) / s.disk.total) * 100) : 0;
  return (
    <>
      <dl className="stats">
        <div><dt>Fotos</dt><dd>{s.photos}</dd></div>
        <div><dt>Álbumes</dt><dd>{s.albums}</dd></div>
        <div><dt>Originales</dt><dd>{bytes(s.originals)}</dd></div>
        <div><dt>Versiones reducidas</dt><dd>{bytes(s.variants)}</dd></div>
      </dl>
      {s.disk && (
        <div className="meter" role="img" aria-label={`Disco: ${bytes(s.disk.free)} libres de ${bytes(s.disk.total)}`}>
          <span style={{ width: `${pct}%` }} />
          <p className="meta">Disco: {bytes(s.disk.free)} libres de {bytes(s.disk.total)}. Memories ocupa {bytes(used)}.</p>
        </div>
      )}
      {s.top.length > 0 && (
        <ol className="top">
          {s.top.map(a => (
            <li key={a.slug}><Link href={`/a/${a.slug}`}>{a.title}</Link><span className="meta">{a.photos} fotos, {bytes(a.bytes)}</span></li>
          ))}
        </ol>
      )}
    </>
  );
}

function Toggle({ k, on, label, hint, run }: { k: keyof Features; on: boolean; label: string; hint: string; run: (fn: () => Promise<AdminResult>) => void }) {
  const [v, setV] = useState(on);
  return (
    <div className="setting">
      <label className="toggle" htmlFor={`tg-${k}`}>
        {label}
        <input type="checkbox" id={`tg-${k}`} checked={v} onChange={e => { const n = e.target.checked; setV(n); run(() => toggleSettingAction(k, n)); }} />
      </label>
      <p className="hint">{hint}</p>
    </div>
  );
}

function SmtpForm({ smtp, envSmtp }: { smtp: Smtp; envSmtp: boolean }) {
  const [state, save, saving] = useActionState(saveSmtpAction, undefined);
  const [test, setTest] = useState<AdminResult>();
  const [testing, start] = useTransition();
  if (envSmtp) return <p className="hint">El correo está configurado con variables de entorno (SMTP_HOST y compañía). Para cambiarlo, editá la configuración del servidor.</p>;
  return (
    <form action={save} id="smtp-form">
      <p className="hint" style={{ marginTop: 0 }}>Se usa para invitar por mail, avisar cuando suben fotos o comentan, y recuperar contraseñas.</p>
      <Result state={test ?? state} />
      <div className="grid-3">
        <Field id="host" label="Servidor" placeholder="smtp.tudominio.com" defaultValue={smtp?.host} required />
        <Field id="port" label="Puerto" type="number" defaultValue={smtp?.port ?? 587} required min={1} max={65535} />
        <Field id="from" label="Remitente" placeholder="Memories <fotos@tudominio.com>" defaultValue={smtp?.from} required />
        <Field id="user" label="Usuario" defaultValue={smtp?.user} autoComplete="off" />
        <Field id="pass" label="Contraseña" type="password" placeholder={smtp?.pass ? 'Guardada (dejala vacía para no cambiarla)' : ''} autoComplete="new-password" />
      </div>
      <label className="toggle" htmlFor="secure">
        Conexión segura desde el inicio (SSL/TLS, normalmente el puerto 465)
        <input type="checkbox" id="secure" name="secure" defaultChecked={smtp?.secure ?? false} />
      </label>
      <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="btn" type="submit" disabled={saving}>Guardar</button>
        <button
          className="btn ghost"
          type="button"
          disabled={testing}
          onClick={() => {
            const form = document.getElementById('smtp-form') as HTMLFormElement;
            start(async () => setTest(await testSmtpAction(new FormData(form))));
          }}
        >
          {testing ? 'Probando…' : 'Mandarme un mail de prueba'}
        </button>
        {smtp && <button className="btn ghost" type="button" onClick={() => start(async () => setTest(await removeSmtpAction()))}>Quitar</button>}
      </div>
    </form>
  );
}

function FacesStatus({ on, f, busy, run }: { on: boolean; f: FacesInfo; busy: boolean; run: (fn: () => Promise<AdminResult>) => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const working = on && (f.models.state === 'downloading' || f.running || (f.models.state === 'ready' && f.scanned < f.total));
  // Mientras trabaja, el panel se actualiza solo
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [working, router]);
  const pct = f.total ? Math.round((f.scanned / f.total) * 100) : 100;
  return (
    <div className="faces-status">
      {on && f.models.state === 'downloading' && <p className="meta">Descargando los modelos… {Math.round((f.models.progress ?? 0) * 100)}%</p>}
      {on && f.models.state === 'error' && (
        <p className="form-error">
          No pudimos descargar los modelos ({f.models.error}). Revisá que el servidor tenga salida a internet, o copiá los archivos a mano en <code>{f.dir}</code>.
        </p>
      )}
      {(f.models.state === 'ready' || !on) && (
        <>
          <div className="meter" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
          <p className="meta">
            {f.scanned} de {f.total} fotos revisadas{working ? ' (buscando caras…)' : ''}. {f.faces} caras, {f.people} {f.people === 1 ? 'persona con nombre' : 'personas con nombre'}.
          </p>
        </>
      )}
      {confirm ? (
        <div className="row-actions">
          <span className="meta">Se borran todas las caras y personas, también las etiquetas a mano.</span>
          <button className="btn danger" type="button" disabled={busy} onClick={() => { setConfirm(false); run(() => forgetFacesAction()); }}>Borrar</button>
          <button className="btn ghost" type="button" onClick={() => setConfirm(false)}>Cancelar</button>
        </div>
      ) : (
        (f.faces > 0 || f.people > 0) && <button className="link-btn" type="button" onClick={() => setConfirm(true)}>Borrar todo lo aprendido</button>
      )}
    </div>
  );
}
