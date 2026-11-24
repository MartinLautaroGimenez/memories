// Exporta los PNG de la marca con Chromium (Playwright).
// Uso: node brand/src/export.mjs
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, '..');
const png = join(brand, 'png');
mkdirSync(png, { recursive: true });

const svg = name => readFileSync(join(brand, name), 'utf8');
const page = (body, bg = 'transparent') =>
  `<html><body style="margin:0;background:${bg}">${body}</body></html>`;

const jobs = [
  { out: 'icon-512.png', size: [512, 512], html: page(svg('app-icon.svg').replace('width="1024" height="1024"', 'width="512" height="512"')) },
  { out: 'icon-192.png', size: [192, 192], html: page(svg('app-icon.svg').replace('width="1024" height="1024"', 'width="192" height="192"')) },
  { out: 'icon-maskable-512.png', size: [512, 512], html: page(svg('app-icon.svg').replace('width="1024" height="1024"', 'width="512" height="512"')) },
  { out: 'apple-touch-icon.png', size: [180, 180], html: page(svg('app-icon.svg').replace('width="1024" height="1024"', 'width="180" height="180"')) },
  { out: 'icon-dark-512.png', size: [512, 512], html: page(svg('app-icon-dark.svg').replace('width="1024" height="1024"', 'width="512" height="512"')) },
  { out: 'favicon-48.png', size: [48, 48], html: page(svg('favicon.svg').replace('width="64" height="64"', 'width="48" height="48"')), transparent: true },
  { out: 'favicon-32.png', size: [32, 32], html: page(svg('favicon.svg').replace('width="64" height="64"', 'width="32" height="32"')), transparent: true },
  { out: 'favicon-16.png', size: [16, 16], html: page(svg('favicon.svg').replace('width="64" height="64"', 'width="16" height="16"')), transparent: true },
  {
    out: 'og-image.png', size: [1200, 630],
    html: page(`<div style="width:1200px;height:630px;display:grid;place-items:center;
      background:radial-gradient(80% 70% at 50% 0%,#F9FCFD,transparent 75%),
      linear-gradient(rgba(23,32,36,.05) 1px,transparent 1px) 0 0/28px 28px,
      linear-gradient(90deg,rgba(23,32,36,.05) 1px,transparent 1px) 0 0/28px 28px,#E9EEF0">
      ${svg('memories-logo.svg').replace(/width="(\d+)" height="64"/, 'width="760" style="height:auto"')}</div>`),
  },
];

const browser = await chromium.launch();
for (const job of jobs) {
  const p = await browser.newPage({ viewport: { width: job.size[0], height: job.size[1] }, deviceScaleFactor: 1 });
  await p.setContent(job.html);
  await p.screenshot({ path: join(png, job.out), omitBackground: !!job.transparent });
  await p.close();
}
await browser.close();
writeFileSync(join(png, '.generated'), new Date().toISOString() + '\n');
console.log('PNG exportados en brand/png:', jobs.map(j => j.out).join(', '));
