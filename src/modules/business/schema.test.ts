import { expect, test } from 'vitest';
import { ItemInput, MovementInput, PeriodInput, RecipeInput, RuleInput } from './schema';
const id = '00000000-0000-4000-8000-000000000001';
test('commission inputs reject fractional satang and excessive rates', () => {
  const rule = { serviceId: id, therapistId: null, mode: 'percent', rateBps: 2500, fixedSatang: 0 };
  expect(RuleInput.safeParse(rule).success).toBe(true);
  expect(RuleInput.safeParse({ ...rule, rateBps: 10001 }).success).toBe(false);
  expect(RuleInput.safeParse({ ...rule, fixedSatang: 0.5 }).success).toBe(false);
});
test('stock accepts signed adjustments and thousandths, refusing precision loss and negative receipts', () => {
  const movement = { itemId: id, kind: 'adjustment', quantity: -0.125, unitCostSatang: 0, reason: 'count', key: 'retry-key' };
  expect(MovementInput.safeParse(movement).success).toBe(true);
  expect(MovementInput.safeParse({ ...movement, kind: 'receipt' }).success).toBe(false);
  expect(MovementInput.safeParse({ ...movement, quantity: 0 }).success).toBe(false);
  expect(MovementInput.safeParse({ ...movement, quantity: 0.0001 }).success).toBe(false);
  expect(ItemInput.safeParse({ id: null, name: 'Oil', unit: 'ml', reorderLevel: -1, active: true }).success).toBe(false);
});
test('recipe rejects duplicate materials and invalid quantities but permits clearing', () => {
  expect(RecipeInput.safeParse({ serviceId: id, materials: [] }).success).toBe(true);
  expect(RecipeInput.safeParse({ serviceId: id, materials: [{ itemId: id, quantity: 1 }, { itemId: id, quantity: 2 }] }).success).toBe(false);
  expect(RecipeInput.safeParse({ serviceId: id, materials: [{ itemId: id, quantity: -1 }] }).success).toBe(false);
});
test('period validation rejects reversed ranges, invalid calendar dates and oversized ranges', () => {
  expect(PeriodInput.safeParse({ from: '2026-11-01', to: '2026-11-15' }).success).toBe(true);
  for (const value of [{ from: '2026-11-15', to: '2026-11-01' }, { from: '2026-02-30', to: '2026-03-01' }, { from: '2026-01-01', to: '2028-01-01' }]) expect(PeriodInput.safeParse(value).success).toBe(false);
});
