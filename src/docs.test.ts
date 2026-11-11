import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

test('the setup guide names every npm script and every environment variable', () => {
  const readme = readFileSync('README.md', 'utf8');
  const dep = readFileSync('docs/deployment.md', 'utf8');
  const scripts = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>);
  for (const s of scripts) expect(readme, `README mentions npm script ${s}`).toContain(s === 'test' || s === 'start' ? `npm ${s === 'test' ? 'test' : 'run start'}` : `npm run ${s}`);
  const vars = (readFileSync('.env.example', 'utf8').match(/^#?\s*([A-Z][A-Z0-9_]+)=/gm) ?? []).map((l) => l.replace(/[#\s=]/g, ''));
  expect(vars.length).toBeGreaterThan(5);
  for (const v of vars) expect(dep, `deployment guide mentions ${v}`).toContain(v);
  expect(readme).not.toContain('create-next-app');
});
