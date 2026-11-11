/** Runs once when the server starts. A production start with a missing or unsafe value stops here, naming every problem. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { parseEnv } = await import('@/lib/env');
  parseEnv(process.env);
}
