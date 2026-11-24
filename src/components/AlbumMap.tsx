'use client';

import 'leaflet/dist/leaflet.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Map as LMap } from 'leaflet';
import { mediaUrl, type LocalPhoto } from './Print';

type Group = { lat: number; lng: number; photos: LocalPhoto[] };

/** Agrupa fotos tomadas en el mismo lugar (unos 100 metros). */
function groups(photos: LocalPhoto[]): Group[] {
  const map = new Map<string, Group>();
  for (const p of photos) {
    if (p.lat == null || p.lng == null) continue;
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
    const g = map.get(key) ?? { lat: p.lat, lng: p.lng, photos: [] };
    g.photos.push(p);
    map.set(key, g);
  }
  return [...map.values()];
}

/**
 * Mapa del álbum: cada lugar es una copia chiquita y el recorrido del viaje
 * se dibuja como una línea de birome. Las teselas son de OpenStreetMap.
 */
export type AlbumMapHandle = { printFor(id: string): HTMLElement | null };

type Props = { photos: LocalPhoto[]; shareToken?: string; onOpen: (id: string) => void };

export const AlbumMap = forwardRef<AlbumMapHandle, Props>(function AlbumMap({ photos, shareToken, onOpen }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const openRef = useRef(onOpen);
  useEffect(() => { openRef.current = onOpen; });
  // id de foto → pin que la contiene (para que el visor salga del pin y vuelva a él)
  const pins = useRef(new Map<string, () => HTMLElement | null>());
  useImperativeHandle(ref, () => ({ printFor: id => pins.current.get(id)?.() ?? null }), []);

  useEffect(() => {
    let map: LMap | null = null;
    let alive = true;
    import('leaflet').then(({ default: L }) => {
      if (!alive || !el.current) return;
      const gs = groups(photos);
      map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, worldCopyJump: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        className: 'map-tiles',
      }).addTo(map);

      // Recorrido en orden de fecha
      const route = photos.filter(p => p.lat != null && p.lng != null && p.takenAt).sort((a, b) => (a.takenAt! < b.takenAt! ? -1 : 1));
      if (route.length > 1) {
        L.polyline(route.map(p => [p.lat!, p.lng!] as [number, number]), { className: 'map-route', weight: 2.5, dashArray: '2 7', lineCap: 'round' }).addTo(map);
      }

      for (const g of gs) {
        const first = g.photos[0];
        const tilt = ((first.id.charCodeAt(0) * 37) % 9) - 4;
        const icon = L.divIcon({
          className: 'map-pin',
          html: `<span class="map-print" style="--t:${tilt}deg"><img src="${mediaUrl(first.id, 'thumb', shareToken)}" alt="" />${g.photos.length > 1 ? `<b>${g.photos.length}</b>` : ''}</span>`,
          iconSize: [64, 64],
          iconAnchor: [32, 32],
        });
        const m = L.marker([g.lat, g.lng], { icon, keyboard: true, title: `${g.photos.length} ${g.photos.length === 1 ? 'foto' : 'fotos'}${first.place ? ` en ${first.place}` : ''}` }).addTo(map);
        const node = () => m.getElement()?.querySelector<HTMLElement>('.map-print') ?? null;
        for (const p of g.photos) pins.current.set(p.id, node);
        m.on('click', () => openRef.current(first.id));
      }
      const bounds = L.latLngBounds(gs.map(g => [g.lat, g.lng] as [number, number]));
      if (gs.length === 1) map.setView(bounds.getCenter(), 12);
      else map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    });
    const registry = pins.current;
    return () => {
      alive = false;
      registry.clear();
      map?.remove();
    };
  }, [photos, shareToken]);

  const withGps = photos.filter(p => p.lat != null).length;
  return (
    <div className="album-map-wrap">
      <div className="album-map" ref={el} role="region" aria-label="Mapa del álbum" />
      <p className="map-note">
        {withGps === photos.length ? 'Todas las fotos tienen ubicación.' : `${withGps} de ${photos.length} fotos tienen ubicación. Las demás no traían GPS.`}
      </p>
    </div>
  );
});
