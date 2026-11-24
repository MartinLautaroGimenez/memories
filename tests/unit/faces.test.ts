import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { align, cosine, findFaces, loadSessions, normalize, readRgb, similarity, type Point } from '@/server/faces/engine';

const TEMPLATE: Point[] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

describe('alineación de caras', () => {
  it('encuentra la semejanza exacta cuando los puntos ya son una copia girada y escalada', () => {
    const ang = 0.3, k = 2.5, tx = 140, ty = -20;
    const src = TEMPLATE.map(([x, y]) => [k * (Math.cos(ang) * x - Math.sin(ang) * y) + tx, k * (Math.sin(ang) * x + Math.cos(ang) * y) + ty] as Point);
    const m = similarity(src, TEMPLATE);
    for (let i = 0; i < 5; i++) {
      const [x, y] = src[i];
      expect(m.c * x - m.s * y + m.tx).toBeCloseTo(TEMPLATE[i][0], 4);
      expect(m.s * x + m.c * y + m.ty).toBeCloseTo(TEMPLATE[i][1], 4);
    }
  });

  it('recorta 112 × 112 en RGB sacando los píxeles del lugar correcto', async () => {
    // Imagen de 300 × 300: mitad izquierda roja, mitad derecha azul
    const w = 300, h = 300;
    const data = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(x < 150 ? [255, 0, 0] : [0, 0, 255], (y * w + x) * 3);
    // Cara en el centro, al doble de tamaño que la plantilla
    const pts = TEMPLATE.map(([x, y]) => [x * 2 + 38, y * 2 + 38] as Point);
    const out = align({ data, width: w, height: h }, pts);
    const plane = 112 * 112;
    const at = (ch: number, x: number, y: number) => out[ch * plane + y * 112 + x];
    expect(at(0, 10, 56)).toBeCloseTo(255); // izquierda: rojo
    expect(at(2, 10, 56)).toBeCloseTo(0);
    expect(at(0, 100, 56)).toBeCloseTo(0); // derecha: azul
    expect(at(2, 100, 56)).toBeCloseTo(255);
  });

  it('normaliza y compara huellas', () => {
    const a = normalize(Float32Array.from([3, 4]));
    expect(a[0]).toBeCloseTo(0.6);
    expect(cosine(a, a)).toBeCloseTo(1);
    expect(cosine(a, normalize(Float32Array.from([-4, 3])))).toBeCloseTo(0);
  });
});

/*
 * Con los modelos reales (no están en el repo): MEMORIES_FACE_MODELS=<carpeta con los .onnx>
 * y MEMORIES_FACE_PHOTOS=<carpeta con fotos>. Se saltea si no están.
 */
const models = process.env.MEMORIES_FACE_MODELS;
const photos = process.env.MEMORIES_FACE_PHOTOS;
const yunet = models && path.join(models, 'face_detection_yunet_2023mar.onnx');
const sface = models && path.join(models, 'face_recognition_sface_2021dec.onnx');
describe.skipIf(!yunet || !existsSync(yunet) || !photos)('con los modelos', () => {
  it('reconoce a la misma persona en dos fotos distintas y la distingue de otra', async () => {
    const s = await loadSessions(yunet!, sface!);
    const face = async (f: string) => (await findFaces(s, await readRgb(path.join(photos!, f), 1800)))[0].embedding;
    const [a, b, c] = await Promise.all(['obama-poster.jpg', 'obama-headshot.jpg', 'harris-ag.jpg'].map(face));
    expect(cosine(a, b)).toBeGreaterThan(0.6);
    expect(cosine(a, c)).toBeLessThan(0.35);
  });
});
