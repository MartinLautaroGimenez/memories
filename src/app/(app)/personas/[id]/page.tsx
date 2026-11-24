import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconBack } from '@/components/icons';
import { FaceDot } from '@/components/People';
import { PersonPhotos, PersonTools } from '@/components/PeoplePage';
import { plural } from '@/lib/format';
import { listPeople, personDetail } from '@/server/people';
import { requireUser } from '@/server/session';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const me = await requireUser(`/personas/${id}`);
  const p = await personDetail(me.id, id);
  return { title: p?.name ?? 'Personas' };
}

export default async function PersonPage({ params }: Props) {
  const { id } = await params;
  const me = await requireUser(`/personas/${id}`);
  const p = await personDetail(me.id, id);
  if (!p) notFound();
  const others = (await listPeople(me.id)).filter(x => x.id !== id).map(x => ({ id: x.id, name: x.name }));
  const maybe = p.photos.filter(x => !x.confirmed);
  return (
    <section>
      <nav className="crumbs" aria-label="Navegación">
        <Link className="backlink" href="/personas"><IconBack /> Personas</Link>
      </nav>
      <header className="person-head">
        <FaceDot id={p.face} size={128} name={p.name} />
        <div>
          <h1 className="page-title">{p.name}</h1>
          <p className="home-sub">
            {plural(p.photos.length, 'foto', 'fotos')} en {plural(p.albums, 'álbum', 'álbumes')}
            {maybe.length > 0 && `, ${maybe.length} sin confirmar`}
          </p>
          <PersonTools id={p.id} name={p.name} others={others} />
        </div>
      </header>
      {maybe.length > 0 && (
        <>
          <h2 className="section-title">¿También es {p.name}?</h2>
          <PersonPhotos items={maybe} name={p.name} />
          <h2 className="section-title">Confirmadas</h2>
        </>
      )}
      <PersonPhotos items={p.photos.filter(x => x.confirmed)} name={p.name} />
    </section>
  );
}
