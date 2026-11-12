import { describe, expect, it } from 'vitest';
import { describeEvent } from './events';

const at = '2030-01-15T03:00:00.000Z';

describe('describeEvent', () => {
  it('turns a status change into from/to and never leaks the note', () => {
    const view = describeEvent({ at, kind: 'status_changed', before: { status: 'confirmed', note: 'secret' }, after: { status: 'checked_in', note: 'secret' } });
    expect(view).toEqual({ at, kind: 'status_changed', from: 'confirmed', to: 'checked_in' });
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('gives a created event its status', () => {
    expect(describeEvent({ at, kind: 'created', before: null, after: { status: 'confirmed', note: 'secret' } })).toEqual({ at, kind: 'created', to: 'confirmed' });
  });

  it('has no from when before is null', () => {
    const view = describeEvent({ at, kind: 'status_changed', before: null, after: { status: 'confirmed' } });
    expect(view).not.toHaveProperty('from');
    expect(view.to).toBe('confirmed');
  });

  it('keeps rescheduled and reassigned free of booking data', () => {
    for (const kind of ['rescheduled', 'reassigned']) {
      const view = describeEvent({ at, kind, before: { status: 'confirmed', note: 'secret' }, after: { status: 'confirmed', note: 'secret' } });
      expect(view.kind).toBe(kind);
      expect(JSON.stringify(view)).not.toContain('secret');
    }
  });

  it('ignores statuses it does not know', () => {
    expect(describeEvent({ at, kind: 'status_changed', before: { status: 'bogus' }, after: 'x' })).toEqual({ at, kind: 'status_changed' });
  });

  it('throws on an unknown kind', () => {
    expect(() => describeEvent({ at, kind: 'charge_adjusted', before: null, after: null })).toThrow();
  });
});
