import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

test('only approved server entry points import the service-key client', () => {
  const importers = walk('src')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'))
    .filter((f) => /supabase\/admin['"]/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => f.split(path.sep).join('/'));
  expect(importers.sort()).toEqual([
    'src/app/[locale]/(staff)/staff/page.tsx',
    'src/app/api/internal/maintenance/route.ts',
    'src/modules/identity/actions.ts',
    'src/modules/notifications/outbox.ts',
    'src/modules/public/db.ts',
  ]);
});
