'use client';

import { useActionState } from 'react';
import type { FormState } from '@/app/actions';

export function NewPasswordForm({ action }: { action: (s: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} noValidate>
      <p className="lead">Elegí una contraseña de al menos 8 caracteres.</p>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="field">
        <label htmlFor="password">Contraseña nueva</label>
        <input className="input" id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
      </div>
      <div className="field">
        <label htmlFor="repeat">Repetila</label>
        <input className="input" id="repeat" name="repeat" type="password" minLength={8} autoComplete="new-password" required />
      </div>
      <button className="btn" type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar y entrar'}</button>
    </form>
  );
}
