import type { Metadata } from 'next';
import Link from 'next/link';
import { FaceDot } from '@/components/People';
import { NameGroup } from '@/components/PeoplePage';
import { plural } from '@/lib/format';
import { listPeople, unnamedGroups } from '@/server/people';
import { requireUser } from '@/server/session';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = { title: 'Personas' };

export default async function PeoplePage() {
  const me = await requireUser('/personas');
  const [people, { groups, loose }, settings] = await Promise.all([listPeople(me.id), unnamedGroups(me.id), getSettings()]);
  return (
    <section>
      <header className="page-head">
        <h1 className="page-title">Personas</h1>
        <p className="home-sub" style={{ marginTop: 12 }}>
          {people.length
            ? 'Quiénes aparecen en tus álbumes. Tocá a alguien para ver todas sus fotos.'
            : settings.faces
              ? 'Cuando nombres a alguien en una foto (en el dorso, "Aparecen"), va a aparecer acá.'
              : 'Podés decir quién aparece en cada foto desde el dorso. Si quien administra prende el reconocimiento facial, Memories también agrupa las caras parecidas.'}
        </p>
      </header>

      {people.length > 0 && (
        <ol className="people-grid">
          {people.map(p => (
            <li key={p.id}>
              <Link href={`/personas/${p.id}`} className="person-card">
                <FaceDot id={p.face} size={112} name={p.name} />
                <b>{p.name}</b>
                <small>{plural(p.count, 'foto', 'fotos')}</small>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {groups.length > 0 && (
        <section className="panel who-groups">
          <h2>¿Quiénes son?</h2>
          <p className="hint">Estas caras se parecen entre sí. Si les ponés nombre, Memories busca a la misma persona en el resto de las fotos.</p>
          <ul>
            {groups.map(g => (
              <li key={g.faces[0]}>
                <NameGroup faces={g.faces} names={people.map(p => p.name)} />
              </li>
            ))}
          </ul>
          {loose > 0 && <p className="hint">Hay {plural(loose, 'cara suelta', 'caras sueltas')} más sin nombre. Las podés nombrar desde el dorso de cada foto.</p>}
        </section>
      )}
    </section>
  );
}
