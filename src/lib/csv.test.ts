import { test, expect } from 'vitest';
import { toCsv } from './csv';

test('csv is Excel-safe: BOM, CRLF, quoting, and no live formulas', () => {
  type R = { n: string; v: number | null };
  const out = toCsv<R>([{ header: 'ชื่อ', value: (r) => r.n }, { header: 'บาท', value: (r) => r.v }],
    [{ n: 'นวดไทย, 60 นาที', v: 1500 }, { n: '=HYPERLINK("x")', v: null }, { n: 'a "b"', v: -5 }]);
  expect(out).toBe('﻿ชื่อ,บาท\r\n"นวดไทย, 60 นาที",1500\r\n"\'=HYPERLINK(""x"")",\r\n"a ""b""",-5\r\n');
});
test('every formula starter is defused, but ordinary text and numbers are left alone', () => {
  const out = toCsv([{ header: 'x', value: (r: string) => r }], ['+1', '-1', '@a', 'plain']);
  expect(out).toBe("﻿x\r\n'+1\r\n'-1\r\n'@a\r\nplain\r\n");
});
