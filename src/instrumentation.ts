/** Runs once when the server starts. A production start with a missing or unsafe value stops here, naming every problem. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { parseEnv } = await import('@/lib/env');
  try {
    parseEnv(process.env);
  } catch (err) {
    if (process.env.APP_ENV === 'production') throw err;
    console.warn(`[startup] Running without complete environment configuration (${err instanceof Error ? err.message : String(err)})`);
  }
}
