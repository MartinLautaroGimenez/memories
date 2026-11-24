'use client';

/**
 * Datos que pasan de una pantalla a otra durante una navegación del cliente:
 * las posiciones de las copias de la pila (para el FLIP al abrir el álbum)
 * y las fotos soltadas en la mesa antes de crear el álbum.
 */
export type FlipRect = { id: string; cx: number; cy: number; w: number; rot: number };

let flip: FlipRect[] | null = null;
let files: File[] | null = null;

export const setFlip = (f: FlipRect[]) => { flip = f; };
export const takeFlip = () => { const f = flip; flip = null; return f; };
export const setPendingFiles = (f: File[]) => { files = f; };
export const takePendingFiles = () => { const f = files; files = null; return f; };
