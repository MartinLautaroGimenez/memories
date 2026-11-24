import 'server-only';
import type { z } from 'zod';
import { auth } from './auth';

export function json(data: unknown, init?: number | ResponseInit) {
  return Response.json(data, typeof init === 'number' ? { status: init } : init);
}

/** Errores con un mensaje que se puede mostrar tal cual. */
export function fail(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function sessionUser(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  return s?.user ?? null;
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const r = schema.safeParse(await req.json());
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export type Ctx<P> = { params: Promise<P> };
