'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { avatarColor } from '@/lib/people';
import { Avatar } from './Avatars';
import { LightSwitch } from './LightSwitch';
import { Logo } from './Logo';

type Me = { id: string; name: string; email: string; role?: string };

export function TopBar({ me, logout }: { me?: Me | null; logout?: () => Promise<void> }) {
  return (
    <header className="bar">
      <Logo />
      <LightSwitch />
      {me && logout && <MeMenu me={me} logout={logout} />}
    </header>
  );
}

function MeMenu({ me, logout }: { me: Me; logout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={wrap}>
      <button className="me-btn" type="button" aria-haspopup="true" aria-expanded={open} aria-label={`Tu cuenta: ${me.name}`} onClick={() => setOpen(o => !o)}>
        <Avatar name={me.name} color={avatarColor(me.id)} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <p className="who">{me.name}</p>
          <p className="mail">{me.email}</p>
          <nav className="menu-links">
            <Link href="/perfil" role="menuitem" onClick={() => setOpen(false)}>Tu perfil</Link>
            {me.role === 'admin' && <Link href="/admin" role="menuitem" onClick={() => setOpen(false)}>Administración</Link>}
          </nav>
          <form action={logout}>
            <button className="btn" type="submit" role="menuitem">
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
