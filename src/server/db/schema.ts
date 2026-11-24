import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/* ---------- Cuentas (formato requerido por Better Auth) ---------- */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** 'admin' administra la instancia; 'member' es cualquier otra persona. */
  role: text('role').notNull().default('member'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  t => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull(),
  },
  t => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/* ---------- Álbumes ---------- */

export const memberRole = pgEnum('member_role', ['owner', 'contributor', 'viewer']);
export type MemberRole = (typeof memberRole.enumValues)[number];

export const album = pgTable('album', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  place: text('place').notNull().default(''),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  coverPhotoId: text('cover_photo_id'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const albumMember = pgTable(
  'album_member',
  {
    albumId: text('album_id')
      .notNull()
      .references(() => album.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('contributor'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.albumId, t.userId] }), index('album_member_user_idx').on(t.userId)],
);

/* ---------- Fotos ---------- */

export const photoStatus = pgEnum('photo_status', ['processing', 'ready', 'failed']);
export type PhotoStatus = (typeof photoStatus.enumValues)[number];

export type Exposure = {
  fNumber?: number;
  exposureTime?: number;
  iso?: number;
  focalLength?: number;
};

export type Variants = Partial<Record<'thumb' | 'display', { w: number; h: number; bytes: number }>>;

export const photo = pgTable(
  'photo',
  {
    id: text('id').primaryKey(),
    albumId: text('album_id')
      .notNull()
      .references(() => album.id, { onDelete: 'cascade' }),
    uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
    originalKey: text('original_key').notNull(),
    originalName: text('original_name').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    /** Hora de reloj de la cámara, guardada como si fuera UTC (EXIF no trae zona horaria). */
    takenAt: ts('taken_at'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    camera: text('camera'),
    exposure: jsonb('exposure').$type<Exposure>(),
    color: text('color'),
    thumbhash: text('thumbhash'),
    variants: jsonb('variants').$type<Variants>(),
    note: text('note').notNull().default(''),
    status: photoStatus('status').notNull().default('processing'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  t => [
    index('photo_album_taken_idx').on(t.albumId, t.takenAt),
    index('photo_processing_idx').on(t.status).where(sql`${t.status} = 'processing'`),
  ],
);

/* ---------- Compartir ---------- */

export const shareLink = pgTable(
  'share_link',
  {
    id: text('id').primaryKey(),
    albumId: text('album_id')
      .notNull()
      .references(() => album.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    passwordHash: text('password_hash'),
    allowDownload: boolean('allow_download').notNull().default(true),
    expiresAt: ts('expires_at'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
  },
  t => [index('share_link_album_idx').on(t.albumId)],
);

export const invite = pgTable(
  'invite',
  {
    id: text('id').primaryKey(),
    albumId: text('album_id')
      .notNull()
      .references(() => album.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    role: memberRole('role').notNull().default('contributor'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    uses: integer('uses').notNull().default(0),
    revokedAt: ts('revoked_at'),
  },
  t => [index('invite_album_idx').on(t.albumId)],
);
