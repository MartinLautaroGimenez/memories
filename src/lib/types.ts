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
  /** Cantidad de comentarios. */
  comments: number;
  /** Reacciones por tipo y las de quien mira. */
  reactions: Partial<Record<ReactionKind, number>>;
  myReactions: ReactionKind[];
  /** Personas que aparecen (ids de `PersonChip`). Solo para miembros. */
  persons?: string[];
};

/** Una persona que aparece en las fotos (reconocida o etiquetada a mano). No es lo mismo que una cuenta. */
export type PersonChip = { id: string; name: string; face: string | null; count: number };

export type FaceDTO = {
  id: string;
  /** Recuadro de 0 a 1 sobre la foto. Null en etiquetas a mano. */
  box: { x: number; y: number; w: number; h: number } | null;
  person: { id: string; name: string } | null;
  /** Lo confirmó alguien (si no, es una sugerencia). */
  confirmed: boolean;
  manual: boolean;
};

export const REACTIONS = ['heart', 'laugh', 'wow'] as const;
export type ReactionKind = (typeof REACTIONS)[number];

export type CommentDTO = {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string; color: string; guest: boolean };
  mine: boolean;
  canDelete: boolean;
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
  /** Personas que aparecen en el álbum. */
  appearing: PersonChip[];
};

export type ShareSettingsDTO = {
  link: { url: string; hasPassword: boolean; allowDownload: boolean; allowUpload: boolean } | null;
  invite: { url: string; expiresAt: string } | null;
  /** Hay correo configurado (se puede invitar por mail). */
  mail: boolean;
  /** La instalación permite subidas de invitados. */
  guestUploads: boolean;
};
