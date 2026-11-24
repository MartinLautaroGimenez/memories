'use client';

import { useState } from 'react';

/** Mensaje de resultado de un formulario, con la contraseña temporal si la hay. */
export function Result({ state }: { state?: { ok?: string; error?: string; secret?: string } }) {
  const [copied, setCopied] = useState(false);
  if (!state) return null;
  if (state.error) return <p className="form-error" role="alert">{state.error}</p>;
  if (!state.ok) return null;
  return (
    <div className="form-ok" role="status">
      <p>{state.ok}</p>
      {state.secret && (
        <p className="secret">
          <code>{state.secret}</code>
          <button
            className="link-btn"
            type="button"
            onClick={async () => {
              try { await navigator.clipboard.writeText(state.secret!); setCopied(true); } catch {}
            }}
          >
            {copied ? 'Copiada' : 'Copiar'}
          </button>
        </p>
      )}
    </div>
  );
}

export function Field({ id, label, hint, ...rest }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input className="input" id={id} name={rest.name ?? id} {...rest} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
