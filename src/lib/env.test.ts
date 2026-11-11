import { test, expect } from 'vitest';
import { bearerMatches, parseEnv } from './env';

const dev = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_KEY: 'pk', SUPABASE_SERVICE_KEY: 'sk' };
const prod = { ...dev, APP_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co', CRON_SECRET: 'x'.repeat(32) };

test('development accepts local values', () => {
  expect(parseEnv(dev)).toMatchObject({ appEnv: 'development', cronSecret: null, senderName: 'Studio' });
});
test('every missing value is named at once', () => {
  expect(() => parseEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL[sS]*NEXT_PUBLIC_SUPABASE_KEY[sS]*SUPABASE_SERVICE_KEY/);
});
test.each([
  [{ ...dev, APP_ENV: 'production', CRON_SECRET: 'x'.repeat(32) }, /NEXT_PUBLIC_SUPABASE_URL/],
  [{ ...dev, APP_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co' }, /CRON_SECRET/],
  [{ ...dev, APP_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co', CRON_SECRET: 'local-dev-only' }, /CRON_SECRET/],
  [{ ...prod, SUPABASE_SERVICE_KEY: 'pk' }, /SUPABASE_SERVICE_KEY/],
])('production refuses unsafe configuration %#', (env, problem) => { expect(() => parseEnv(env)).toThrow(problem); });
test('production accepts a complete configuration', () => {
  expect(parseEnv(prod).appEnv).toBe('production');
});
test('bearer comparison accepts only the exact secret', () => {
  expect([bearerMatches('Bearer s3cret', 's3cret'), bearerMatches('Bearer s3cre', 's3cret'), bearerMatches('s3cret', 's3cret'), bearerMatches(null, 's3cret')]).toEqual([true, false, false, false]);
});
