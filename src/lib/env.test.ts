import { test, expect } from 'vitest';
import { bearerMatches, parseEnv } from './env';

const dev = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_KEY: 'pk', SUPABASE_SERVICE_KEY: 'sk' };
const prod = { ...dev, APP_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co', CRON_SECRET: 'x'.repeat(32) };

test('development accepts local values', () => {
  expect(parseEnv(dev)).toMatchObject({ appEnv: 'development', cronSecret: null, senderName: 'Studio' });
});
test('every missing value is named at once', () => {
  expect(() => parseEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_KEY[\s\S]*SUPABASE_SERVICE_KEY/);
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
const lineVars = {
  LINE_LOGIN_CHANNEL_ID: '123', LINE_LOGIN_CHANNEL_SECRET: 'sec', LINE_MESSAGING_TOKEN: 'tok',
  PUBLIC_BASE_URL: 'https://spa.example.com', PUBLIC_TOKEN_SECRET: 't'.repeat(32),
};
test('LINE is null when none of its variables are set, and complete when all are', () => {
  expect(parseEnv(dev).line).toBeNull();
  expect(parseEnv({ ...dev, ...lineVars }).line).toEqual({
    loginChannelId: '123', loginChannelSecret: 'sec', messagingToken: 'tok', publicBaseUrl: 'https://spa.example.com',
    tokenSecret: 't'.repeat(32), apiBase: 'https://api.line.me', authBase: 'https://access.line.me',
  });
});
test('partial LINE configuration is an error naming the missing variables', () => {
  expect(() => parseEnv({ ...dev, LINE_LOGIN_CHANNEL_ID: '123' }))
    .toThrow(/LINE_LOGIN_CHANNEL_SECRET[\s\S]*LINE_MESSAGING_TOKEN[\s\S]*PUBLIC_BASE_URL[\s\S]*PUBLIC_TOKEN_SECRET/);
});
test('a short PUBLIC_TOKEN_SECRET or a malformed PUBLIC_BASE_URL is refused', () => {
  expect(() => parseEnv({ ...dev, ...lineVars, PUBLIC_TOKEN_SECRET: 'short' })).toThrow(/PUBLIC_TOKEN_SECRET/);
  expect(() => parseEnv({ ...dev, ...lineVars, PUBLIC_BASE_URL: 'not a url' })).toThrow(/PUBLIC_BASE_URL/);
});
test('bearer comparison accepts only the exact secret', () => {
  expect([bearerMatches('Bearer s3cret', 's3cret'), bearerMatches('Bearer s3cre', 's3cret'), bearerMatches('s3cret', 's3cret'), bearerMatches(null, 's3cret')]).toEqual([true, false, false, false]);
});

test('the test-only LINE address overrides are refused in production', () => {
  const withLine = { ...prod, ...lineVars };
  expect(parseEnv(withLine).line).not.toBeNull();
  expect(() => parseEnv({ ...withLine, LINE_API_BASE: 'http://evil.test' })).toThrow(/LINE_API_BASE/);
  expect(() => parseEnv({ ...withLine, LINE_AUTH_BASE: 'http://evil.test' })).toThrow(/LINE_AUTH_BASE/);
  expect(parseEnv({ ...dev, ...lineVars, LINE_API_BASE: 'http://localhost:3199' }).line?.apiBase).toBe('http://localhost:3199');
});
