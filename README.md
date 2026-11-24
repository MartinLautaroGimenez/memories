# memories

Tus fotos de viajes y eventos en un lugar propio. Open source, self-hosted y pensado para verse igual de bien en la compu y en el celu.

> Estado: **diseño**. Todavía no hay una app para instalar. Lo que hay es el documento de diseño, el sistema visual y un prototipo navegable.

## Qué hay en este repo

| Ruta | Qué es |
|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | Producto, alcance del MVP, arquitectura, modelo de datos, plan por etapas y preguntas abiertas |
| [`design/prototype/`](design/prototype/) | Prototipo interactivo de la interfaz (un solo HTML, sin build) |
| [`.claude/skills/memories-ui/`](.claude/skills/memories-ui/SKILL.md) | El sistema de diseño ("Mesa de luz" / "Cuarto oscuro") escrito como skill, para que cualquier sesión de Claude Code lo respete |
| [`.claude/skills/frontend-design/`](.claude/skills/frontend-design/SKILL.md) | La skill oficial de Anthropic para diseño de interfaces (Apache-2.0), copiada sin cambios |

## Ver el prototipo

```bash
cd design/prototype
```

```bash
./fetch-photos.sh
```

```bash
python3 -m http.server 8000
```

Después abrí http://localhost:8000. Las fotos de ejemplo vienen de Unsplash (vía Lorem Picsum) y no se suben al repo.

En el prototipo podés:

- Pasar el mouse por una pila para hojearla y hacer clic para abrir el álbum.
- Arrastrar las copias sobre la mesa (en el celu, mantené presionado).
- Abrir una foto y darla vuelta con **F** o con el botón. Las flechas cambian de foto y **Esc** cierra.
- Cambiar a la vista **Carrusel** y girarla arrastrando.
- Soltar tus propias fotos en la ventana para verlas "revelarse" (no se suben a ningún lado).
- Apagar la **Luz** para entrar al cuarto oscuro.

## Stack previsto

Next.js + TypeScript, PostgreSQL con Drizzle, sharp para las imágenes, pg-boss para la cola de trabajos, Better Auth, Motion para las animaciones y Docker Compose para levantarlo todo. El detalle está en [`docs/DESIGN.md`](docs/DESIGN.md).
