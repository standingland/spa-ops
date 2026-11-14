import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ratio } from './contrast.test';

const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
const block = css.match(/\.theme-night\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const tokens: Record<string, string> = {};
for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]] = m[2];

// Every text and control pairing the public pages use, in WCAG AA terms.
const pairs: [string, string][] = [
  ['ink', 'surface'], ['ink', 'surface-muted'],
  ['ink-muted', 'surface'], ['ink-muted', 'surface-muted'],
  ['primary-foreground', 'primary'],
  ['primary', 'surface'], ['primary', 'surface-muted'],   // brass text and selected borders on the night surfaces
  ['danger', 'surface'], ['danger', 'surface-muted'],
];

describe('public theme colour contrast (WCAG AA 4.5:1)', () => {
  it('defines the night tokens', () => {
    for (const k of ['ink', 'ink-muted', 'surface', 'surface-muted', 'primary', 'primary-foreground', 'danger']) expect(tokens[k], `--${k}`).toBeDefined();
  });
  it.each(pairs)('%s on %s', (fg, bg) => {
    const r = ratio(tokens[fg], tokens[bg]);
    expect(r, `${fg} on ${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });
  it('non-text lines stay visible against the surface (3:1)', () => {
    expect(ratio(tokens['line-strong'], tokens['surface'])).toBeGreaterThanOrEqual(3);
  });
});
