import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

/*
 * Herramientas que se sumaron después: mapa y Atlas, dorso editable, corregir la hora,
 * favoritas, proyector, quién aparece, la app instalable y sin conexión.
 * Corre después de flow.spec.ts (usa la cuenta que crea esa prueba).
 */

const ME = { email: 'martina@example.com', password: 'una-clave-larga' };

/** Tres fotos con fecha y ubicación en el EXIF (como las de un celular). */
async function gpsPhotos() {
  const dir = await mkdtemp(path.join(tmpdir(), 'memories-e2e-gps-'));
  const dms = (v: number) => {
    const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 6000);
    return `${d}/1 ${m}/1 ${s}/100`;
  };
  const specs = [
    { name: 'IMG_1001.JPG', color: '#7d93a3', date: '2026:04:03 10:00:00', lat: -41.1335, lng: -71.3103 },
    { name: 'IMG_1002.JPG', color: '#a3927d', date: '2026:04:05 18:30:00', lat: -49.3315, lng: -72.886 },
    { name: 'IMG_1003.JPG', color: '#6f8f74', date: '2026:04:07 08:15:00', lat: -50.3402, lng: -72.2648 },
  ];
  const files: string[] = [];
  for (const s of specs) {
    const file = path.join(dir, s.name);
    await sharp({ create: { width: 1600, height: 1067, channels: 3, background: s.color } })
      .withExif({
        IFD0: { Make: 'Apple', Model: 'iPhone 15' },
        IFD2: { DateTimeOriginal: s.date },
        IFD3: { GPSLatitudeRef: s.lat < 0 ? 'S' : 'N', GPSLatitude: dms(s.lat), GPSLongitudeRef: s.lng < 0 ? 'W' : 'E', GPSLongitude: dms(s.lng) },
      })
      .jpeg({ quality: 82 })
      .toFile(file);
    files.push(file);
  }
  return files;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ME.email);
  await page.getByLabel('Contraseña').fill(ME.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu mesa' })).toBeVisible();
}

async function openFirstPhoto(page: Page) {
  await page.locator('.spread .print.ready').first().click();
  await expect(page.locator('.viewer')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

let albumUrl = '';

test('fotos con GPS: mapa del álbum con interruptor y Atlas', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Nuevo álbum' }).click();
  await page.getByLabel('Nombre').fill('Patagonia');
  await page.getByRole('button', { name: 'Crear álbum' }).click();
  await expect(page).toHaveURL(/\/a\/patagonia-/);
  albumUrl = page.url();
  await page.locator('input[type=file]').setInputFiles(await gpsPhotos());
  await expect(page.locator('.spread .print.ready')).toHaveCount(3, { timeout: 60_000 });

  // Mapa: una copia chiquita por lugar
  await page.locator('.seg').getByRole('button', { name: 'Mapa' }).click();
  await expect(page.locator('.map-pin')).toHaveCount(3);
  await expect(page.getByText('Todas las fotos tienen ubicación.')).toBeVisible();
  await page.locator('.map-pin').nth(1).click();
  await expect(page.locator('.viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.viewer')).toHaveCount(0);

  // Quien administra el álbum puede apagarlo
  await page.getByRole('button', { name: 'Más opciones del álbum' }).click();
  await page.getByRole('menuitem', { name: 'Editar álbum' }).click();
  await page.getByLabel('Mostrar el mapa del álbum').uncheck();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('.seg').getByRole('button', { name: 'Mapa' })).toHaveCount(0);
  await page.goto('/atlas');
  await expect(page.getByRole('heading', { name: 'Atlas', level: 1 })).toBeVisible();
  await expect(page.getByText('Patagonia')).toHaveCount(0);

  // Prendido otra vez, el viaje aparece en el Atlas
  await page.goto(albumUrl);
  await page.getByRole('button', { name: 'Más opciones del álbum' }).click();
  await page.getByRole('menuitem', { name: 'Editar álbum' }).click();
  await page.getByLabel('Mostrar el mapa del álbum').check();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('.seg').getByRole('button', { name: 'Mapa' })).toBeVisible();
  await page.goto('/atlas');
  await expect(page.locator('.atlas-list')).toContainText('Patagonia');
  await expect(page.locator('.atlas-globe canvas')).toBeVisible();
});

test('dorso: corregir fecha y lugar, y la hora de todo el álbum', async ({ page }) => {
  await login(page);
  await page.goto(albumUrl);
  await openFirstPhoto(page);
  await page.getByRole('button', { name: 'Dar vuelta' }).click();
  await page.getByRole('button', { name: 'Corregir fecha, lugar o cámara' }).click();
  await page.locator('.specs-edit input[name=date]').fill('2026-04-02');
  await page.locator('.specs-edit input[name=time]').fill('09:30');
  await page.locator('.specs-edit input[name=place]').fill('Bariloche');
  await page.locator('.specs-edit').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.specs')).toContainText('Bariloche');
  await expect(page.locator('.specs')).toContainText('(corregida)');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Corregir la hora de todas: adelantar 2 horas
  await page.getByRole('button', { name: 'Más opciones del álbum' }).click();
  await page.getByRole('menuitem', { name: 'Corregir la hora' }).click();
  await page.getByLabel(/Todo el álbum/).check();
  await page.locator('.sheet .num input').nth(1).fill('2');
  const saved = page.waitForResponse(r => r.url().includes('/photos/batch') && r.ok());
  await page.locator('.sheet .btn:not(.ghost)').last().click();
  await saved;
  await expect(page.locator('.sheet')).toHaveCount(0);
  // La primera foto ahora es 11:30 (9:30 + 2 h)
  await openFirstPhoto(page);
  await page.getByRole('button', { name: 'Dar vuelta' }).click();
  await expect(page.locator('.specs')).toContainText('11:30');
});

test('favoritas y modo proyector', async ({ page }) => {
  await login(page);
  await page.goto(albumUrl);
  await openFirstPhoto(page);
  await page.locator('.viewer').getByRole('button', { name: /favorita/i }).first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Favoritas 1/ }).click();
  await expect(page.locator('.spread .print.ready')).toHaveCount(1);
  await page.getByRole('button', { name: /Favoritas 1/ }).click();
  await expect(page.locator('.spread .print.ready')).toHaveCount(3);

  await page.getByRole('button', { name: 'Proyectar el álbum' }).click();
  const projector = page.getByRole('dialog', { name: /Modo proyector/ });
  await expect(projector).toBeVisible();
  await expect(projector.locator('.pj-title')).toContainText('1 de 3');
  await page.keyboard.press('ArrowRight');
  await expect(projector.locator('.pj-title')).toContainText('2 de 3');
  await page.keyboard.press('Space');
  await expect(projector.getByRole('button', { name: 'Seguir' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(projector).toHaveCount(0);
});

test('quién aparece: etiqueta a mano, página de personas y filtro', async ({ page }) => {
  await login(page);
  await page.goto(albumUrl);
  await openFirstPhoto(page);
  await page.getByRole('button', { name: 'Dar vuelta' }).click();
  await expect(page.locator('.specs')).toContainText('Aparecen');
  await page.getByRole('button', { name: 'Agregar a alguien' }).click();
  await page.getByLabel('Agregar a alguien que no se detectó').fill('Ana');
  await page.locator('.who-add').getByRole('button', { name: 'Agregar' }).click();
  await expect(page.locator('.who-rows')).toContainText('Ana');
  await page.keyboard.press('Escape');
  await expect(page.locator('.who-list')).toContainText('Ana');
  await page.keyboard.press('Escape');

  // El álbum filtra por persona
  await page.reload();
  const chip = page.locator('.person-chip', { hasText: 'Ana' });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.locator('.spread .print.ready')).toHaveCount(1);

  // Y tiene su página
  await page.goto('/personas');
  await page.locator('.person-card', { hasText: 'Ana' }).click();
  await expect(page.getByRole('heading', { name: 'Ana', level: 1 })).toBeVisible();
  await expect(page.locator('.person-head')).toContainText('1 foto en 1 álbum');
});

test('la app: service worker, compartir desde la galería y sin conexión', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Compartir dos fotos desde otra app (lo que hace el menú Compartir del celu)
  const res = await page.evaluate(async () => {
    const fd = new FormData();
    for (const [i, color] of ['#c33', '#3c3'].entries()) {
      const c = Object.assign(document.createElement('canvas'), { width: 600, height: 400 });
      const g = c.getContext('2d')!;
      g.fillStyle = color;
      g.fillRect(0, 0, 600, 400);
      const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg'));
      fd.append('photos', new File([blob], `compartida-${i}.jpg`, { type: 'image/jpeg' }));
    }
    const r = await fetch('/compartir', { method: 'POST', body: fd });
    return new URL(r.url).pathname + new URL(r.url).search;
  });
  expect(res).toBe('/compartir?n=2');
  await page.goto(res);
  await expect(page.getByText('2 fotos listas para subir.')).toBeVisible();
  await page.locator('.share-albums button', { hasText: 'Patagonia' }).click();
  await expect(page).toHaveURL(albumUrl);
  await expect(page.locator('.spread .print.ready')).toHaveCount(5, { timeout: 60_000 });
  await page.waitForTimeout(2500); // el service worker guarda la página

  // Sin conexión: lo visto se sigue viendo; lo demás muestra la pantalla propia
  await ctx.setOffline(true);
  await page.goto(albumUrl);
  await expect(page.getByRole('heading', { name: 'Patagonia', level: 1 })).toBeVisible();
  await page.goto('/a/nunca-visto');
  await expect(page.getByRole('heading', { name: 'Estás sin conexión' })).toBeVisible();
  await ctx.setOffline(false);

  // Al cerrar sesión no quedan fotos guardadas
  await page.goto('/');
  await page.getByRole('button', { name: /Tu cuenta/ }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter(k => k === 'memories-media' || k === 'memories-pages').length)).toBe(0);
  await ctx.close();
});
