import { initials, namesList } from '@/lib/people';
import type { PersonDTO } from '@/lib/types';

export function Avatars({ people, meId, max = 4 }: { people: PersonDTO[]; meId?: string; max?: number }) {
  const others = people.filter(p => p.id !== meId).map(p => p.name.split(' ')[0]);
  const label = namesList(others, !!meId && people.some(p => p.id === meId));
  return (
    <span className="avatars" role="img" aria-label={label}>
      {people.slice(0, max).map((p, i) => (
        <span key={p.id || i} className="av" style={{ ['--avc' as string]: p.color }}>
          {initials(p.name)}
        </span>
      ))}
      {people.length > max && <span className="av more">+{people.length - max}</span>}
    </span>
  );
}

export function Avatar({ name, color, size }: { name: string; color: string; size?: number }) {
  return (
    <span className="av" style={{ ['--avc' as string]: color, width: size, height: size }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
