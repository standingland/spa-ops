import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const tokens: Record<string, string> = {};
for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]] = m[2];

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const tints = Object.keys(tokens).filter((k) => k.startsWith('tint-'));
const pairs: [string, string][] = [
  ['primary-foreground', 'primary'],
  ['ink', 'surface'],
  ['ink', 'surface-muted'],
  ...tints.map((t): [string, string] => ['ink', t]),
  ['ink-muted', 'surface'],
  ['ink-muted', 'surface-muted'],
  ['danger', 'surface'],
];

describe('colour contrast guard (WCAG AA 4.5:1)', () => {
  it('defines all 12 status tints', () => {
    expect(tints).toHaveLength(12);
  });
  it.each(pairs)('%s on %s', (fg, bg) => {
    expect(tokens[fg], `--${fg} missing`).toBeDefined();
    expect(tokens[bg], `--${bg} missing`).toBeDefined();
    const r = ratio(tokens[fg], tokens[bg]);
    expect(r, `${fg} on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });
});
