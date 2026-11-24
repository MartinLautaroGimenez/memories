'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestResetAction } from '@/app/actions';
import { TopBar } from '@/components/TopBar';

export default function RecoverPage() {
  const [state, run, pending] = useActionState(requestResetAction, undefined);
  const sent = state?.values?.sent === '1';
  return (
    <>
      <TopBar />
      <main className="auth">
        <div className="auth-card">
          <div>
            <h1>¿Olvidaste tu contraseña?</h1>
            {sent ? (
              <>
                <p className="lead">Si hay una cuenta con {state?.values?.email}, te llega un mail con un link para elegir una contraseña nueva. Vence en 2 horas.</p>
                <Link className="btn" href="/login">Volver a entrar</Link>
              </>
            ) : (
              <form action={run} noValidate>
                <p className="lead">Escribí tu email y te mandamos un link para elegir una nueva.</p>
                {state?.error && <p className="form-error" role="alert">{state.error}</p>}
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} required />
                </div>
                <button className="btn" type="submit" disabled={pending}>{pending ? 'Mandando…' : 'Mandar link'}</button>
                <p className="auth-foot"><Link href="/login">Volver a entrar</Link></p>
              </form>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
