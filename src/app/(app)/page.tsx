import { Table } from '@/components/Table';
import { atlasAlbums, listAlbumCards, onThisDay } from '@/server/albums';
import { listPeople } from '@/server/people';
import { requireUser } from '@/server/session';
import { getSettings } from '@/server/settings';

export default async function HomePage() {
  const me = await requireUser();
  const [cards, memory, settings] = await Promise.all([listAlbumCards(me.id), onThisDay(me.id), getSettings()]);
  const atlas = settings.maps && cards.length > 0 && (await atlasAlbums(me.id)).length > 0;
  const people = cards.length > 0 && (settings.faces || (await listPeople(me.id)).length > 0);
  return <Table cards={cards} meId={me.id} memory={memory} atlas={atlas} people={people} />;
}
