---
name: memories-ui
description: Sistema de diseño de Memories ("Mesa de luz" / "Cuarto oscuro"). Usala SIEMPRE que toques cualquier interfaz de Memories, ya sea un componente, una pantalla, una animación, un efecto 3D, un estado vacío o el texto de la UI. Complementa a frontend-design: esta skill define las decisiones ya tomadas para este proyecto y tiene prioridad sobre los gustos por defecto.
---

# Memories: sistema de diseño

Memories guarda fotos de viajes y eventos. La interfaz no imita una app de fotos: imita **los objetos reales de la fotografía**. Una copia impresa tiene borde, peso, sombra y dorso. Una diapositiva tiene marco. Un rollo tiene números de cuadro. Cada decisión visual sale de ese mundo. Si un detalle no podría existir en un laboratorio de fotos, una mesa de luz o un álbum de papel, probablemente sobra.

Referencia viva: `design/prototype/index.html`. Si esta skill y el prototipo no coinciden, gana el prototipo y se actualiza la skill.

## Concepto

| Tema | Metáfora | Sensación |
|---|---|---|
| Claro | **Mesa de luz** encendida: acrílico opalino, luz fría desde abajo, grilla tenue de alineación | Luminoso, limpio, de trabajo |
| Oscuro | **Cuarto oscuro**: tela negra, luz de seguridad roja que baña desde arriba | Íntimo, cálido, nocturno |

El interruptor de tema es una **tecla de luz física** ("Luz"). Apagar la mesa = entrar al cuarto oscuro. Por defecto sigue al sistema operativo.

## Tokens

Los colores viven solo como variables CSS. Ningún componente usa un literal.

```css
:root {                       /* Mesa de luz */
  --table:      #E9EEF0;      /* acrílico opalino, frío (NO crema) */
  --table-hot:  #F7FAFB;      /* centro de la luz */
  --table-edge: #CDD6DA;
  --grid:       rgb(27 35 39 / .055);
  --ink:        #172024;      /* grafito frío */
  --ink-soft:   #536168;
  --paper:      #FCFCFA;      /* borde de la copia */
  --paper-back: #F3F2EE;      /* dorso de la copia */
  --stamp:      #FF6B12;      /* fechador LED naranja de cámara compacta */
  --stamp-ink:  #B93F06;      /* naranja legible sobre fondo claro (texto) */
  --shadow:     rgb(18 34 44 / .22);
}
/* Cuarto oscuro: mismos tokens, otros valores */
--table: #160C0B; --table-hot: #3B100D; --table-edge: #0B0605;
--ink: #F2E6E0; --ink-soft: #B39A92; --paper: #EFE9E4; --stamp: #FF7A22;
```

- **Un solo acento**: el naranja del fechador. Se usa para la fecha estampada, el foco del teclado y estados activos. Nunca como fondo grande.
- Los neutros tienen sesgo frío en claro y rojo en oscuro. Nunca un gris puro ni un negro puro.
- Las fotos **no se tiñen** en el cuarto oscuro. La luz roja afecta la mesa y no el contenido.

## Tipografía

- **Archivo** (variable, ejes `wdth` 62–125 y `wght` 100–900) es la única familia de UI. La personalidad sale de los extremos del eje de ancho:
  - Títulos de álbum: `wdth 125`, `wght 800`, interletrado negativo, tamaño `clamp(3rem, 9vw, 8.5rem)`.
  - Metadatos (lugar, coordenadas, cámara): `wdth 72`, `wght 500`, como el texto impreso en el borde de un negativo.
  - Cuerpo: `wdth 100`, `wght 400`, 16–17px, línea de 1.5, ancho máximo de 65ch.
- **Reenie Beanie** (manuscrita) se usa SOLO para lo escrito a mano: el dorso de las copias y la etiqueta de las diapositivas. Nunca para botones, títulos ni navegación.
- **Fechas estampadas**: dígitos de 7 segmentos dibujados en SVG (componente `DateStamp`) con brillo naranja, formato `D M 'AA`. Es el único lugar donde aparece el fechador.
- Prohibido: Inter, Roboto, Space Grotesk, monoespaciada para etiquetas, MAYÚSCULAS con tracking como "eyebrow", una sola palabra del título resaltada en otro color, metadatos unidos con puntos medios (`A · B · C`) y flechas `→` en los botones.

## Objetos (componentes base)

1. **Copia (Print)**: la foto con borde de papel (`padding: 3.2%` del ancho), esquinas de 2px, una rotación de reposo aleatoria pero estable (semilla = id de la foto) de ±3°, y dos sombras: una de contacto (corta y densa) y una ambiental (larga y suave), teñidas con `--shadow`.
2. **Pila (Stack)**: un álbum en la mesa. Es la portada arriba y dos copias debajo que asoman rotadas. Al pasar el mouse se abre en abanico en 3D.
3. **Dorso**: la cara de atrás de una copia. Tiene papel con marca de agua repetida en diagonal, el texto manuscrito, la fecha estampada y la ficha técnica (lugar, cámara, apertura, velocidad, ISO, quién la subió). **Los metadatos EXIF viven en el dorso**, no en un panel lateral.
4. **Diapositiva (Slide)**: el marco cuadrado de 35mm con ventana 3:2 y etiqueta manuscrita. Se usa en la vista Carrusel.
5. **Fechador (DateStamp)**: SVG de 7 segmentos inclinado unos −6°.

## Movimiento

Toda animación responde a una acción de la persona, salvo **un solo momento orquestado por pantalla**: al cargar, las copias "caen" sobre la mesa en cascada (escala 1.06 → 1, sombra grande → chica, 60ms de desfase, como máximo unos 600ms en total).

| Gesto | Respuesta | Curva / duración |
|---|---|---|
| Hover en copia/pila | inclinación 3D siguiendo el puntero (máx. 10°) y reflejo de papel brillante que se mueve | resorte suave, interpolado por rAF |
| Hover en pila | abanico: las copias de abajo rotan y se separan | `cubic-bezier(.16,1,.3,1)` 450ms |
| Abrir álbum | FLIP: las copias de la pila vuelan a su lugar en el álbum | 700ms `cubic-bezier(.16,1,.3,1)` |
| Abrir foto | la copia se levanta de la mesa al centro (FLIP) y la mesa se oscurece | 560ms, mismo easing |
| Dar vuelta | rotateY 180° con `preserve-3d` | 700ms `cubic-bezier(.3,.8,.2,1)` |
| Arrastrar copia | se levanta (escala 1.04 y sombra larga), sigue al dedo con inercia y rota según dónde la agarraste | física propia: fricción 0.92 por frame |
| Subir foto | **revelado**: la copia aparece blanca y la imagen emerge (contraste, brillo y desenfoque hasta normal) | 2.4s `ease-out` |
| Carrusel | anillo 3D de diapositivas, arrastre con inercia que se acomoda en la más cercana | resorte, rotateY del anillo |

**Revelado = estado de carga.** No hay skeletons con brillo ni spinners: mientras una imagen carga, la copia muestra su color dominante a bajo contraste y, cuando `img.decode()` resuelve, se revela.

## 3D: cómo y cuándo

- Por defecto, **CSS 3D** (`perspective`, `preserve-3d`, `rotateX/Y`, `translateZ`). Funciona en celulares de gama media y no necesita WebGL.
- **React Three Fiber** solo para vistas que realmente lo justifiquen, aisladas en su propia ruta y cargadas con `dynamic()`. Ejemplo: un futuro "Atlas" con globo. Nunca mezclar R3F y Motion en el mismo árbol de componentes.
- Animar solo `transform` y `opacity`. Las sombras se animan escalando o variando la opacidad de un pseudo-elemento, nunca cambiando `box-shadow`.
- `will-change: transform` solo mientras dura el gesto. Se quita al terminar.
- `prefers-reduced-motion: reduce` desactiva la inclinación, el abanico, la cascada y el revelado (pasan a cambios instantáneos o fundidos de 150ms). El volteo sigue funcionando pero sin rotación: se hace con un fundido cruzado.

## Layout

- La mesa es asimétrica. Las pilas se ubican en una grilla de 3, 2 o 2 columnas (escritorio, tablet, celu) con desplazamientos y rotaciones de reposo, no en filas perfectas.
- El encabezado de un álbum va alineado a la izquierda y el título enorme puede cortarse en dos líneas.
- En el celu (<640px) todo pasa a una columna o a dos columnas compactas. Arrastrar una copia en táctil requiere mantener presionado 250ms para no pelear con el scroll.
- `min-height: 100dvh`, nunca `100vh`. Los márgenes laterales usan `max(16px, env(safe-area-inset-*))`.

## Texto de la interfaz

- Español rioplatense con voseo y en minúscula inicial: "Subí fotos", "Arrastrá para reordenar", "Soltá las fotos sobre la mesa".
- Los verbos de acción se mantienen en todo el flujo: el botón "Compartir" produce el aviso "Link copiado"; "Subir fotos" produce "3 fotos reveladas".
- Los estados vacíos invitan a actuar: "Esta mesa está vacía. Soltá tus fotos acá o tocá Subir fotos".
- Los errores dicen qué pasó y cómo seguir: "No pudimos leer IMG_2041.HEIC. Probá exportarla como JPG".
- Nada de "Elevá tus recuerdos", "experiencia", "sin esfuerzo" ni emojis.

## Calidad mínima (checklist antes de dar algo por terminado)

- [ ] Funciona a 375px de ancho sin scroll horizontal.
- [ ] Teclado: Tab llega a todo, el foco se ve (anillo `--stamp`), Esc cierra, ← y → navegan y F da vuelta la foto.
- [ ] Ambos temas revisados, no solo invertidos.
- [ ] Reduced motion probado.
- [ ] Imágenes con `width`/`height` o `aspect-ratio` (sin saltos de layout), `loading="lazy"` y `decoding="async"`.
- [ ] Sin fuentes de respaldo silenciosas: `font-display: swap` y pila de respaldo declarada.
