export type Role = 'owner' | 'contributor' | 'viewer';

export type Exposure = {
  fNumber?: number;
  exposureTime?: number;
  iso?: number;
  focalLength?: number;
};

export type PhotoDTO = {
  id: string;
  status: 'processing' | 'ready' | 'failed';
  w: number | null;
  h: number | null;
  color: string | null;
  thumbhash: string | null;
  /** Hora de reloj de la cámara en ISO (se muestra siempre en UTC). */
  takenAt: string | null;
  note: string;
  camera: string | null;
  exposure: Exposure | null;
  file: string;
  by: { id: string; name: string } | null;
  error: string | null;
  /** Lugar escrito para esta foto (si no, el del álbum). */
  place: string | null;
  /** Fecha original del EXIF, para mostrar o deshacer correcciones. */
  exifTakenAt: string | null;
  /** Nombre de quien la subió sin cuenta. */
  guestName: string | null;
  /** Favorita de quien mira. */
  fav: boolean;
  lat: number | null;
  lng: number | null;
};

export type PersonDTO = { id: string; name: string; color: string; role: Role };

export type AlbumCardDTO = {
  id: string;
  slug: string;
  title: string;
  place: string;
  from: string | null;
  to: string | null;
  count: number;
  people: PersonDTO[];
  preview: PhotoDTO[];
};

export type AlbumDTO = {
  id: string;
  slug: string;
  title: string;
  place: string;
  coords: string | null;
  from: string | null;
  to: string | null;
  coverPhotoId: string | null;
  /** Rol de quien mira. `public` = entró con un link compartido. */
  role: Role | 'public';
  people: PersonDTO[];
  photos: PhotoDTO[];
  /** Solo en vistas públicas: token para pedir las imágenes. */
  shareToken?: string;
  allowDownload?: boolean;
  /** Solo en vistas públicas: los invitados pueden subir fotos. */
  allowUpload?: boolean;
  sortMode: 'date' | 'manual';
  /** Títulos escritos para cada día: { "2026-06-15": "Seljalandsfoss" } */
  dayNotes: Record<string, string>;
  /** El álbum muestra su mapa (ajuste del álbum). */
  showMap: boolean;
  /** Los mapas están activados en la instalación. */
  mapsEnabled: boolean;
  facesEnabled: boolean;
};

export type ShareSettingsDTO = {
  link: { url: string; hasPassword: boolean; allowDownload: boolean; allowUpload: boolean } | null;
  invite: { url: string; expiresAt: string } | null;
  /** Hay correo configurado (se puede invitar por mail). */
  mail: boolean;
  /** La instalación permite subidas de invitados. */
  guestUploads: boolean;
};
