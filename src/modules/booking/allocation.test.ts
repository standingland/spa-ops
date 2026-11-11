import { test, expect } from 'vitest';
import { rankAllocations, type Candidate } from './allocation';

const c = (t: string, p: string, min: number, sort: number): Candidate => ({ therapistId: t, positionId: p, roomId: 'r' + p, therapistMinutesToday: min, roomSort: sort });
test('balances workload, then room order', () => {
  const out = rankAllocations([c('a','2',120,2), c('b','1',60,1), c('b','2',60,2), c('a','1',120,1)], {});
  expect(out.map((x) => x.therapistId + x.positionId)).toEqual(['b1','b2','a1','a2']);
});
test('a preferred therapist outranks workload', () => {
  const out = rankAllocations([c('b','1',0,1), c('a','1',300,1)], { preferredTherapistId: 'a' });
  expect(out[0].therapistId).toBe('a');
});
test('an unavailable preferred therapist changes nothing and empty stays empty', () => {
  expect(rankAllocations([c('b','1',0,1)], { preferredTherapistId: 'zz' })).toHaveLength(1);
  expect(rankAllocations([], {})).toEqual([]);
});
