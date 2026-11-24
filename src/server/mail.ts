import 'server-only';
import nodemailer from 'nodemailer';
import { env } from './env';
import { getSettings, smtpFromEnv, type SmtpSettings } from './settings';

export async function smtpConfig(): Promise<SmtpSettings | null> {
  return smtpFromEnv() ?? (await getSettings()).smtp;
}

export async function mailEnabled() {
  const s = await smtpConfig();
  return !!s?.host;
}

export function transportFor(s: SmtpSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
}

export type Mail = { to: string; subject: string; title: string; lines: string[]; cta?: { label: string; url: string }; foot?: string };

/** Envía un mail. Si no hay SMTP configurado no hace nada y devuelve false. */
export async function sendMail(m: Mail, override?: SmtpSettings): Promise<boolean> {
  const s = override ?? (await smtpConfig());
  if (!s?.host) return false;
  await transportFor(s).sendMail({
    from: s.from,
    to: m.to,
    subject: m.subject,
    text: [m.title, '', ...m.lines, ...(m.cta ? ['', `${m.cta.label}: ${m.cta.url}`] : []), '', m.foot ?? footText()].join('\n'),
    html: html(m),
  });
  return true;
}

/** Igual que sendMail pero sin cortar el flujo si el correo falla. */
export async function trySendMail(m: Mail) {
  try {
    return await sendMail(m);
  } catch (err) {
    console.error('[memories] no se pudo mandar el mail:', err instanceof Error ? err.message : err);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const footText = () => `Memories en ${env.APP_URL}`;

/** Mail con la estética de la app: mesa de luz y una copia de papel. */
function html(m: Mail) {
  const button = m.cta
    ? `<p style="margin:28px 0 8px"><a href="${esc(m.cta.url)}" style="display:inline-block;background:#172024;color:#F4F8F9;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">${esc(m.cta.label)}</a></p>
       <p style="margin:0;color:#6b767c;font-size:13px">Si el botón no anda, copiá este link: <br><span style="color:#172024;word-break:break-all">${esc(m.cta.url)}</span></p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#E9EEF0;padding:32px 12px;font-family:'Helvetica Neue',Arial,sans-serif;color:#172024">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px" cellspacing="0" cellpadding="0">
      <tr><td style="padding:0 6px 14px;font-size:22px;font-weight:800;letter-spacing:-0.5px">memories</td></tr>
      <tr><td style="background:#FCFCFA;border-radius:4px;padding:30px 28px;box-shadow:0 12px 30px -12px rgba(18,34,44,.35)">
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.15;letter-spacing:-0.5px">${esc(m.title)}</h1>
        ${m.lines.map(l => `<p style="margin:0 0 10px;font-size:16px;line-height:1.5;color:#2a3236">${esc(l)}</p>`).join('')}
        ${button}
      </td></tr>
      <tr><td style="padding:14px 6px;color:#6b767c;font-size:12px">${esc(m.foot ?? footText())}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}
