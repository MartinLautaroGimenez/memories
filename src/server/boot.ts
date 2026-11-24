/** Arranque del servidor (solo Node.js): migraciones y fotos pendientes. */
export async function boot() {
  const g = globalThis as unknown as { __memoriesBooted?: boolean };
  if (g.__memoriesBooted) return;
  g.__memoriesBooted = true;

  if (!process.env.DATABASE_URL) {
    console.warn('[memories] Falta DATABASE_URL: no se aplican migraciones.');
    return;
  }
  try {
    if (process.env.AUTO_MIGRATE !== 'false') {
      const { runMigrations } = await import('./db/migrate');
      await runMigrations(process.env.DATABASE_URL);
    }
    const { resumePending } = await import('./photos/queue');
    await resumePending();
  } catch (err) {
    console.error('[memories] No se pudo preparar la base de datos:', err);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
}
