import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { account, session, user, verification } from './db/schema';
import { env } from './env';
import { trySendMail } from './mail';

export const auth = betterAuth({
  appName: 'Memories',
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  trustedOrigins: [env.APP_URL, ...env.TRUSTED_ORIGINS],
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 60 * 2,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user: u, url }) => {
      // Si la cuenta nunca se usó, es una cuenta nueva creada desde Administración.
      const used = await db.execute<{ n: number }>(sql`select count(*)::int as n from session where user_id = ${u.id}`);
      const fresh = used.rows[0]?.n === 0;
      const first = u.name.split(' ')[0];
      await trySendMail(
        fresh
          ? {
              to: u.email,
              subject: 'Te crearon una cuenta en Memories',
              title: `Hola ${first}, tu cuenta está lista`,
              lines: ['Te crearon una cuenta en Memories para ver y subir fotos de viajes y eventos.', 'Elegí tu contraseña con este link para entrar. Vence en 2 horas.'],
              cta: { label: 'Elegir contraseña', url },
            }
          : {
              to: u.email,
              subject: 'Elegí una contraseña nueva para Memories',
              title: 'Contraseña nueva',
              lines: [`Hola ${first}. Alguien pidió cambiar la contraseña de tu cuenta.`, 'Si fuiste vos, elegí una nueva con este link. Vence en 2 horas.'],
              cta: { label: 'Elegir contraseña', url },
              foot: 'Si no lo pediste, ignorá este mail: tu contraseña sigue siendo la misma.',
            },
      );
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'member', input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 días
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies: env.APP_URL.startsWith('https://'),
  },
  hooks: {
    // Las cuentas solo se crean desde el servidor: en la instalación inicial o con una invitación.
    before: createAuthMiddleware(async ctx => {
      if (ctx.path.startsWith('/sign-up') && ctx.request) {
        throw new APIError('FORBIDDEN', { message: 'Las cuentas nuevas se crean con una invitación a un álbum.' });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // La primera persona que se registra administra la instancia.
        before: async data => {
          const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from "user"`);
          return { data: { ...data, role: rows.rows[0]?.n === 0 ? 'admin' : 'member' } };
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
