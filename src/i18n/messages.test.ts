import { test, expect } from 'vitest';
import th from '../../messages/th.json';
import en from '../../messages/en.json';

type Tree = { [k: string]: string | string[] | Tree };
function flatten(t: Tree, prefix = ''): Record<string, string> {
  return Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') return { ...acc, [key]: v };
    if (Array.isArray(v)) return { ...acc, [key]: v.join('|') };
    return { ...acc, ...flatten(v, key) };
  }, {});
}
const a = flatten(th as unknown as Tree), b = flatten(en as unknown as Tree);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('Thai and English have exactly the same keys', () => {
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
});
test('no message is empty', () => {
  expect(Object.entries(a).filter(([, v]) => v.trim() === '').map(([k]) => `th ${k}`)).toEqual([]);
  expect(Object.entries(b).filter(([, v]) => v.trim() === '').map(([k]) => `en ${k}`)).toEqual([]);
});
test('placeholders are identical in both languages', () => {
  const diff = Object.keys(a).filter((k) => b[k] !== undefined && placeholders(a[k]).join() !== placeholders(b[k]).join());
  expect(diff).toEqual([]);
});
