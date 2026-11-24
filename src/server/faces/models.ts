import 'server-only';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { storagePath } from '../storage';

/**
 * Los modelos no vienen en la imagen: se descargan la primera vez que alguien
 * prende el reconocimiento facial, desde una versión fija y verificando el hash.
 * Si el servidor no tiene salida a internet, se pueden copiar a mano a `STORAGE_PATH/models/`.
 */
const HF = 'https://huggingface.co/opencv';
export const MODELS = {
  yunet: {
    file: 'face_detection_yunet_2023mar.onnx',
    url: `${HF}/face_detection_yunet/resolve/3cc26e7f1014a5ee5d74a42acee58bafc9d0a310/face_detection_yunet_2023mar.onnx`,
    sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    bytes: 232_589,
  },
  sface: {
    file: 'face_recognition_sface_2021dec.onnx',
    url: `${HF}/face_recognition_sface/resolve/3d7082438a6e4551e840c9b2bb60b71e8da4b524/face_recognition_sface_2021dec.onnx`,
    sha256: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
    bytes: 38_696_353,
  },
} as const;
type Key = keyof typeof MODELS;
const TOTAL = MODELS.yunet.bytes + MODELS.sface.bytes;

export type ModelsState = { state: 'missing' | 'downloading' | 'ready' | 'error'; progress?: number; error?: string };
const g = globalThis as unknown as { __memoriesModels?: { status: ModelsState; job: Promise<boolean> | null; done: number } };
const st = (g.__memoriesModels ??= { status: { state: 'missing' }, job: null, done: 0 });

export const modelPath = (k: Key) => storagePath(`models/${MODELS[k].file}`);
export const modelsDir = () => storagePath('models');

async function present(k: Key) {
  const s = await stat(modelPath(k)).catch(() => null);
  return s?.size === MODELS[k].bytes;
}

export async function modelsState(): Promise<ModelsState> {
  if (st.status.state === 'downloading' || st.status.state === 'error') return st.status;
  const ok = (await present('yunet')) && (await present('sface'));
  return ok ? { state: 'ready' } : st.status.state === 'ready' ? { state: 'missing' } : st.status;
}

async function download(k: Key) {
  const m = MODELS[k];
  const part = `${modelPath(k)}.part`;
  await mkdir(modelsDir(), { recursive: true });
  const res = await fetch(m.url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`la descarga de ${m.file} respondió ${res.status}`);
  const hash = createHash('sha256');
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    st.done += chunk.length;
    st.status = { state: 'downloading', progress: Math.min(0.99, st.done / TOTAL) };
  });
  try {
    await pipeline(body, createWriteStream(part));
    const sum = hash.digest('hex');
    if (sum !== m.sha256) throw new Error(`${m.file} no coincide con el hash esperado`);
    await rename(part, modelPath(k));
  } catch (err) {
    await rm(part, { force: true });
    throw err;
  }
}

/** Se asegura de tener los dos modelos. Devuelve false si no se pudieron conseguir. */
export function ensureModels(): Promise<boolean> {
  st.job ??= (async () => {
    try {
      const missing = [] as Key[];
      for (const k of ['yunet', 'sface'] as const) if (!(await present(k))) missing.push(k);
      if (missing.length) {
        st.done = 0;
        st.status = { state: 'downloading', progress: 0 };
        console.log('[memories] descargando los modelos de reconocimiento facial…');
        for (const k of missing) await download(k);
        console.log('[memories] modelos listos');
      }
      st.status = { state: 'ready' };
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[memories] no se pudieron descargar los modelos:', msg);
      st.status = { state: 'error', error: msg };
      return false;
    } finally {
      st.job = null;
    }
  })();
  return st.job;
}
