import 'server-only';
import type { InferenceSession, Tensor } from 'onnxruntime-node';
import sharp from 'sharp';

/**
 * Motor de caras, todo local:
 * - YuNet (MIT) encuentra las caras y sus cinco puntos (ojos, nariz y comisuras).
 * - SFace (Apache-2.0) convierte cada cara alineada en una huella de 128 números.
 * Dos huellas de la misma persona se parecen (similitud coseno alta).
 * Es la misma receta que FaceDetectorYN y FaceRecognizerSF de OpenCV, escrita en TypeScript.
 */

export type Point = [number, number];
export type Detection = { x: number; y: number; w: number; h: number; score: number; points: Point[] };
export type FoundFace = Detection & { embedding: Float32Array };
type Rgb = { data: Buffer; width: number; height: number };
type Sessions = { yunet: InferenceSession; sface: InferenceSession; ort: typeof import('onnxruntime-node') };

const SIZE = 640; // YuNet viene con entrada fija de 640 × 640
const STRIDES = [8, 16, 32];
const SCORE = 0.8;
const NMS_IOU = 0.3;
/** Caras más chicas que esto (en píxeles de la foto de 1800) dan huellas poco confiables. */
export const MIN_FACE = 36;
const MAX_FACES = 40;
/** Puntos de referencia de SFace para una cara de 112 × 112. */
const TEMPLATE: Point[] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

const g = globalThis as unknown as { __memoriesFaceSessions?: Promise<Sessions> };

export function loadSessions(yunetPath: string, sfacePath: string): Promise<Sessions> {
  g.__memoriesFaceSessions ??= (async () => {
    const ort = await import('onnxruntime-node');
    const opts: InferenceSession.SessionOptions = { intraOpNumThreads: 2, interOpNumThreads: 1, graphOptimizationLevel: 'all', logSeverityLevel: 3 };
    const [yunet, sface] = await Promise.all([ort.InferenceSession.create(yunetPath, opts), ort.InferenceSession.create(sfacePath, opts)]);
    return { yunet, sface, ort };
  })().catch(err => {
    g.__memoriesFaceSessions = undefined;
    throw err;
  });
  return g.__memoriesFaceSessions;
}

/** Lee una imagen (ya orientada) como RGB crudo. */
export async function readRgb(input: Buffer | string, maxSide?: number): Promise<Rgb> {
  let img = sharp(input).removeAlpha();
  if (maxSide) img = img.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function resizeRgb(src: Rgb, maxSide: number): Promise<Rgb> {
  const { data, info } = await sharp(src.data, { raw: { width: src.width, height: src.height, channels: 3 } })
    .resize({ width: maxSide, height: maxSide, fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Copia una ventana de la imagen a un tensor BGR de 640 × 640 (lo que falta queda en negro). */
function windowTensor(ort: Sessions['ort'], img: Rgb, x0: number, y0: number): Tensor {
  const plane = SIZE * SIZE;
  const t = new Float32Array(3 * plane);
  const w = Math.min(SIZE, img.width - x0), h = Math.min(SIZE, img.height - y0);
  for (let y = 0; y < h; y++) {
    let si = ((y0 + y) * img.width + x0) * 3;
    let di = y * SIZE;
    for (let x = 0; x < w; x++, si += 3, di++) {
      t[di] = img.data[si + 2]; // B
      t[plane + di] = img.data[si + 1]; // G
      t[2 * plane + di] = img.data[si]; // R
    }
  }
  return new ort.Tensor('float32', t, [1, 3, SIZE, SIZE]);
}

async function detectWindow(s: Sessions, img: Rgb, x0: number, y0: number, scale: number): Promise<Detection[]> {
  const out = await s.yunet.run({ [s.yunet.inputNames[0]]: windowTensor(s.ort, img, x0, y0) });
  const found: Detection[] = [];
  for (const stride of STRIDES) {
    const cls = out[`cls_${stride}`].data as Float32Array;
    const obj = out[`obj_${stride}`].data as Float32Array;
    const box = out[`bbox_${stride}`].data as Float32Array;
    const kps = out[`kps_${stride}`].data as Float32Array;
    const cols = SIZE / stride, rows = SIZE / stride;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
        if (score < SCORE) continue;
        const cx = (c + box[i * 4]) * stride, cy = (r + box[i * 4 + 1]) * stride;
        const w = Math.exp(box[i * 4 + 2]) * stride, h = Math.exp(box[i * 4 + 3]) * stride;
        const points: Point[] = [];
        for (let n = 0; n < 5; n++) points.push([((kps[i * 10 + 2 * n] + c) * stride + x0) / scale, ((kps[i * 10 + 2 * n + 1] + r) * stride + y0) / scale]);
        found.push({ x: (cx - w / 2 + x0) / scale, y: (cy - h / 2 + y0) / scale, w: w / scale, h: h / scale, score, points });
      }
    }
  }
  return found;
}

const iou = (a: Detection, b: Detection) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
};

/** Qué parte de la caja más chica queda dentro de la otra (una cara cortada queda adentro de la entera). */
const inside = (a: Detection, b: Detection) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / Math.min(a.w * a.h, b.w * b.h);
};

function nms(list: Detection[]) {
  const keep: Detection[] = [];
  for (const d of list.sort((a, b) => b.score - a.score)) {
    if (keep.every(k => iou(k, d) < NMS_IOU && inside(k, d) < 0.5)) keep.push(d);
  }
  return keep;
}

/**
 * Busca caras en dos pasadas: la foto entera achicada a 640 (caras grandes)
 * y, si la foto es grande, en ventanas de 640 sobre una versión de 1280 (caras chicas, como en fotos grupales).
 */
export async function detect(s: Sessions, img: Rgb): Promise<Detection[]> {
  const long = Math.max(img.width, img.height);
  const all: Detection[] = [];
  const small = long > SIZE ? await resizeRgb(img, SIZE) : img;
  all.push(...(await detectWindow(s, small, 0, 0, small.width / img.width)));
  if (long >= 1000) {
    const big = long > 1280 ? await resizeRgb(img, 1280) : img;
    const scale = big.width / img.width;
    const step = SIZE - 128;
    const xs = big.width <= SIZE ? [0] : [...Array(Math.ceil((big.width - SIZE) / step) + 1).keys()].map(i => Math.min(i * step, big.width - SIZE));
    const ys = big.height <= SIZE ? [0] : [...Array(Math.ceil((big.height - SIZE) / step) + 1).keys()].map(i => Math.min(i * step, big.height - SIZE));
    const M = 6; // una cara que toca el borde de una ventana (y no el de la foto) está cortada: la ve otra ventana
    for (const y0 of ys) {
      for (const x0 of xs) {
        for (const d of await detectWindow(s, big, x0, y0, scale)) {
          const l = d.x * scale - x0, t = d.y * scale - y0, r = l + d.w * scale, b = t + d.h * scale;
          if ((x0 > 0 && l < M) || (y0 > 0 && t < M) || (x0 + SIZE < big.width && r > SIZE - M) || (y0 + SIZE < big.height && b > SIZE - M)) continue;
          all.push(d);
        }
      }
    }
  }
  return nms(all)
    .filter(d => d.w >= MIN_FACE && d.h >= MIN_FACE)
    .slice(0, MAX_FACES)
    .map(d => {
      // Recorta al borde de la foto
      const x = Math.max(0, d.x), y = Math.max(0, d.y);
      return { ...d, x, y, w: Math.min(img.width, d.x + d.w) - x, h: Math.min(img.height, d.y + d.h) - y };
    });
}

/** Transformación de semejanza (rotación + escala + traslado) que lleva `src` a `dst` por mínimos cuadrados. */
export function similarity(src: Point[], dst: Point[]) {
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let a = 0, b = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i][0] - sx, py = src[i][1] - sy, qx = dst[i][0] - dx, qy = dst[i][1] - dy;
    a += px * qx + py * qy;
    b += px * qy - py * qx;
    den += px * px + py * py;
  }
  const c = a / den, s = b / den;
  // dst = [c -s; s c] · src + t
  return { c, s, tx: dx - (c * sx - s * sy), ty: dy - (s * sx + c * sy) };
}

/** Recorta y endereza una cara a 112 × 112 (interpolación bilineal), como `alignCrop` de OpenCV. */
export function align(img: Rgb, points: Point[]): Float32Array {
  const { c, s, tx, ty } = similarity(points, TEMPLATE);
  // Inversa de la semejanza: de la cara alineada a la foto
  const k = c * c + s * s;
  const ic = c / k, is = -s / k;
  const plane = 112 * 112;
  const out = new Float32Array(3 * plane);
  for (let y = 0; y < 112; y++) {
    for (let x = 0; x < 112; x++) {
      const u = x - tx, v = y - ty;
      const fx = ic * u - is * v, fy = is * u + ic * v;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const ax = fx - x0, ay = fy - y0;
      const di = y * 112 + x;
      for (let ch = 0; ch < 3; ch++) {
        const px = (xx: number, yy: number) =>
          xx < 0 || yy < 0 || xx >= img.width || yy >= img.height ? 0 : img.data[(yy * img.width + xx) * 3 + ch];
        const top = px(x0, y0) * (1 - ax) + px(x0 + 1, y0) * ax;
        const bottom = px(x0, y0 + 1) * (1 - ax) + px(x0 + 1, y0 + 1) * ax;
        out[ch * plane + di] = top * (1 - ay) + bottom * ay; // RGB, de 0 a 255
      }
    }
  }
  return out;
}

export function normalize(v: Float32Array) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => x / n);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

export async function embed(s: Sessions, img: Rgb, points: Point[]): Promise<Float32Array> {
  const t = new s.ort.Tensor('float32', align(img, points), [1, 3, 112, 112]);
  const out = await s.sface.run({ [s.sface.inputNames[0]]: t });
  return normalize(Float32Array.from(out[s.sface.outputNames[0]].data as Float32Array));
}

/** Todas las caras de una imagen, con su huella. */
export async function findFaces(s: Sessions, img: Rgb): Promise<FoundFace[]> {
  const faces: FoundFace[] = [];
  for (const d of await detect(s, img)) faces.push({ ...d, embedding: await embed(s, img, d.points) });
  return faces;
}
