/** Se ejecuta una vez al arrancar el servidor. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { boot } = await import('./server/boot');
    await boot();
  }
}
