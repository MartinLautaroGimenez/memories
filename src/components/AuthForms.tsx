'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { FormState } from '@/app/actions';

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

function Field({ id, label, type = 'text', auto, defaultValue, min }: { id: string; label: string; type?: string; auto?: string; defaultValue?: string; min?: number }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input className="input" id={id} name={id} type={type} autoComplete={auto} defaultValue={defaultValue} minLength={min} required />
    </div>
  );
}

function ErrorLine({ state }: { state: FormState }) {
  return state?.error ? (
    <p className="form-error" role="alert">
      {state.error}
    </p>
  ) : null;
}

export function SignupForm({ action, submit }: { action: Action; submit: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} noValidate>
      <ErrorLine state={state} />
      <Field id="name" label="Tu nombre" auto="name" defaultValue={state?.values?.name} />
      <Field id="email" label="Email" type="email" auto="email" defaultValue={state?.values?.email} />
      <Field id="password" label="Contraseña" type="password" auto="new-password" min={8} />
      <p className="hint" style={{ marginTop: -6, marginBottom: 16 }}>Al menos 8 caracteres.</p>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'Un momento…' : submit}
      </button>
    </form>
  );
}

export function LoginForm({ action, next }: { action: Action; next?: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} noValidate>
      <ErrorLine state={state} />
      <input type="hidden" name="next" value={next ?? '/'} />
      <Field id="email" label="Email" type="email" auto="email" defaultValue={state?.values?.email} />
      <Field id="password" label="Contraseña" type="password" auto="current-password" />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

export function PasswordForm({ action }: { action: Action }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} noValidate>
      <ErrorLine state={state} />
      <Field id="password" label="Contraseña del álbum" type="password" auto="off" />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'Probando…' : 'Ver el álbum'}
      </button>
    </form>
  );
}

export function JoinForm({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form action={action}>
      <button className="btn" type="submit">
        {label}
      </button>
    </form>
  );
}

export function LoginLink({ next }: { next: string }) {
  return (
    <p className="auth-foot">
      ¿Ya tenés cuenta? <Link href={`/login?next=${encodeURIComponent(next)}`}>Entrá acá</Link>
    </p>
  );
}
