import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

/** Fotos de prueba con EXIF de cámara, generadas en el momento. */
async function makePhotos() {
  const dir = await mkdtemp(path.join(tmpdir(), 'memories-e2e-'));
  const specs = [
    { name: 'DSCF0001.JPG', w: 1800, h: 1200, top: '#5d7686', bottom: '#2c2a26', date: '2026:06:15 16:05:07', orientation: 1 },
    { name: 'IMG_0002.JPG', w: 1600, h: 1200, top: '#bac8d6', bottom: '#6b7f8a', date: '2026:06:17 11:20:00', orientation: 6 },
    { name: 'IMG_0003.JPG', w: 1200, h: 1200, top: '#c7cbc7', bottom: '#8a6a4c', date: '2026:06:20 19:10:00', orientation: 1 },
  ];
  const files: string[] = [];
  for (const s of specs) {
    const svg = `<svg width="${s.w}" height="${s.h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.top}"/><stop offset="1" stop-color="${s.bottom}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    const file = path.join(dir, s.name);
    await sharp(Buffer.from(svg))
      .withExif({ IFD0: { Make: 'FUJIFILM', Model: 'X100V' }, IFD2: { DateTimeOriginal: s.date, FNumber: '8/1', ExposureTime: '1/500', ISOSpeedRatings: '160' } })
      .withMetadata({ orientation: s.orientation })
      .jpeg({ quality: 85 })
      .toFile(file);
    files.push(file);
  }
  return files;
}

async function expectNoHorizontalScroll(page: Page) {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(w);
}

test.describe.configure({ mode: 'serial' });

let albumUrl = '';
let inviteUrl = '';
let publicUrl = '';

test('primera cuenta, álbum, fotos, dorso y compartir', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel('Tu nombre').fill('Martina Prueba');
  await page.getByLabel('Email').fill('martina@example.com');
  await page.getByLabel('Contraseña').fill('una-clave-larga');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.getByRole('heading', { name: 'Tu mesa' })).toBeVisible();
  await expect(page.getByText('Esta mesa está vacía')).toBeVisible();

  // Nuevo álbum
  await page.getByRole('button', { name: 'Nuevo álbum' }).click();
  await page.getByLabel('Nombre').fill('Islandia');
  await page.getByLabel('Lugar (opcional)').fill('Costa sur de Islandia');
  await page.getByRole('button', { name: 'Crear álbum' }).click();
  await expect(page).toHaveURL(/\/a\/islandia-[a-z0-9]{4}$/);
  albumUrl = page.url();
  await expect(page.getByRole('heading', { name: 'Islandia', level: 1 })).toBeVisible();

  // Subir y esperar el revelado
  const files = await makePhotos();
  await page.locator('input[type=file]').setInputFiles(files);
  await expect(page.locator('.spread .print.ready')).toHaveCount(3, { timeout: 60_000 });
  await expect(page.getByText('3 fotos reveladas')).toBeVisible();

  // Las fechas del EXIF ordenan el álbum y arman el rango del encabezado
  await expect(page.locator('.album-meta [aria-label="15 al 20 de junio de 2026"]')).toBeVisible();

  // Visor: abrir, dar vuelta y escribir en el dorso
  await page.locator('.spread .print.ready').first().click();
  const viewer = page.getByRole('dialog', { name: /Islandia, foto 1 de 3/ });
  await expect(viewer).toBeVisible();
  await page.keyboard.press('f');
  await expect(viewer.getByRole('button', { name: 'Ver foto' })).toBeVisible();
  await expect(viewer.getByText('Fujifilm X100V')).toBeVisible();
  await expect(viewer.getByText('f/8 1/500 ISO 160')).toBeVisible();
  const saved = page.waitForResponse(r => r.url().includes('/api/photos/') && r.request().method() === 'PATCH');
  await viewer.getByLabel('Escrito atrás').fill('El avión de Sólheimasandur');
  expect((await saved).ok()).toBe(true);
  await page.keyboard.press('Escape'); // sale del campo de texto
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: /foto 2 de 3/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /foto/ })).toHaveCount(0);

  // Carrusel
  await page.getByRole('button', { name: 'Carrusel', exact: true }).click();
  await expect(page.locator('.slide')).toHaveCount(3);
  await expect(page.locator('.c-cap')).toContainText('El avión de Sólheimasandur');

  // Compartir: invitación y link público
  await page.getByRole('button', { name: 'Compartir' }).click();
  await page.getByRole('button', { name: 'Crear link de invitación' }).click();
  inviteUrl = await page.getByLabel('Link de invitación').inputValue();
  expect(inviteUrl).toMatch(/\/invite\/[\w-]+$/);
  await page.getByLabel('Cualquiera con el link puede ver').check();
  await expect(page.getByLabel('Link público del álbum')).toHaveValue(/\/s\/[\w-]+$/);
  publicUrl = await page.getByLabel('Link público del álbum').inputValue();
  expect(publicUrl).toMatch(/\/s\/[\w-]+$/);
  await page.keyboard.press('Escape');

  // La mesa muestra la pila con sus fotos
  await page.getByRole('link', { name: 'Mesa', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Islandia, 3 fotos' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('el link público muestra el álbum sin poder editarlo', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(new URL(publicUrl).pathname);
  await expect(page.getByRole('heading', { name: 'Islandia', level: 1 })).toBeVisible();
  await expect(page.locator('.spread .print.ready')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Subir fotos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compartir' })).toHaveCount(0);
  await page.locator('.spread .print.ready').first().click();
  await page.keyboard.press('f');
  await expect(page.getByLabel('Escrito atrás')).toHaveAttribute('readonly', '');
  // Las imágenes cargan con el token del link
  const ok = await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('.spread img');
    return img ? (await fetch(img.src)).ok : false;
  });
  expect(ok).toBe(true);
  // Sin el token, nada
  const res = await page.request.get(`${new URL(albumUrl).origin}/media/nada/thumb`);
  expect(res.status()).toBe(404);
  await ctx.close();
});

test('una invitación crea la cuenta y suma al álbum', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(new URL(inviteUrl).pathname);
  await expect(page.getByText('Martina te invitó a Islandia')).toBeVisible();
  await page.getByLabel('Tu nombre').fill('Juli');
  await page.getByLabel('Email').fill('juli@example.com');
  await page.getByLabel('Contraseña').fill('otra-clave-larga');
  await page.getByRole('button', { name: 'Crear cuenta y entrar' }).click();
  await expect(page).toHaveURL(albumUrl);
  await expect(page.locator('.spread .print.ready')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Subir fotos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compartir' })).toHaveCount(0);
  await ctx.close();
});

test('sin sesión no se ve nada privado', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(new URL(albumUrl).pathname);
  await expect(page).toHaveURL(/\/login\?next=/);
  const api = await page.request.post('/api/albums', { data: { title: 'x' } });
  expect(api.status()).toBe(401);
  await ctx.close();
});
