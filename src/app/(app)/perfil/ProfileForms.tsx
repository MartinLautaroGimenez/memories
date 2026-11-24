'use client';

import { useActionState, useState, useTransition } from 'react';
import { Field, Result } from '@/components/FormBits';
import { changePasswordAction, setNotificationsAction, updateNameAction, type ProfileResult } from './actions';

export function ProfileForms({ name, email, notifications, mail }: { name: string; email: string; notifications: boolean; mail: boolean }) {
  const [nameState, saveName, savingName] = useActionState(updateNameAction, undefined);
  const [passState, savePass, savingPass] = useActionState(changePasswordAction, undefined);
  const [notif, setNotif] = useState(notifications);
  const [notifState, setNotifState] = useState<ProfileResult>();
  const [, start] = useTransition();

  return (
    <div className="panels">
      <section className="panel">
        <h2>Tus datos</h2>
        <form action={saveName}>
          <Result state={nameState} />
          <Field id="name" label="Nombre" defaultValue={name} required maxLength={80} autoComplete="name" />
          <Field id="email" label="Email" defaultValue={email} disabled hint="Para cambiar el email, pedíselo a quien administra Memories." />
          <button className="btn" type="submit" disabled={savingName}>Guardar nombre</button>
        </form>
      </section>

      <section className="panel">
        <h2>Contraseña</h2>
        <form action={savePass}>
          <Result state={passState} />
          <Field id="current" label="Contraseña actual" type="password" required autoComplete="current-password" />
          <Field id="next" label="Contraseña nueva" type="password" required minLength={8} autoComplete="new-password" hint="Al menos 8 caracteres." />
          <Field id="repeat" label="Repetí la contraseña nueva" type="password" required minLength={8} autoComplete="new-password" />
          <button className="btn" type="submit" disabled={savingPass}>Cambiar contraseña</button>
        </form>
      </section>

      <section className="panel">
        <h2>Avisos por mail</h2>
        <Result state={notifState} />
        <label className="toggle" htmlFor="notif">
          Avisarme cuando suben fotos o comentan en mis álbumes
          <input
            type="checkbox"
            id="notif"
            checked={notif}
            onChange={e => {
              const v = e.target.checked;
              setNotif(v);
              start(async () => setNotifState(await setNotificationsAction(v)));
            }}
          />
        </label>
        {!mail && <p className="hint">Esta instalación todavía no tiene correo configurado, así que por ahora no se manda nada.</p>}
      </section>
    </div>
  );
}
