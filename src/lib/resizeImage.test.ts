import { test, expect } from 'vitest';
import { fitWithin } from './resizeImage';

test('4000x3000 at 256 gives 256x192', () => { expect(fitWithin(4000, 3000, 256)).toEqual({ width: 256, height: 192 }); });
test('a portrait 3000x4000 gives 192x256', () => { expect(fitWithin(3000, 4000, 256)).toEqual({ width: 192, height: 256 }); });
test('smaller than max is unchanged', () => { expect(fitWithin(200, 100, 256)).toEqual({ width: 200, height: 100 }); });
test('a 10000x1 image never collapses to height 0', () => { expect(fitWithin(10000, 1, 256)).toEqual({ width: 256, height: 1 }); });
