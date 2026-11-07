import { describe, expect, it } from 'vitest';
import {
  emptyReadingState,
  readingDay,
  readingStats,
  recordReading,
  undoReading,
  setPreference,
  preferenceFor,
  parseReadingSnapshot,
} from './articleReading';

describe('personal article reading', () => {
  it('defaults to want and permits explicit seen without inventing a read', () => {
    expect(preferenceFor(emptyReadingState(), 'go').interest).toBe('want');
    const seen = setPreference(emptyReadingState(), { postId: 'go', interest: 'seen' });
    expect(readingStats(seen, 'go', '2026-11-07')).toEqual({ count: 0, lastDay: null, completedToday: null });
  });
  it('moves a recorded article to seen and restores its category on undo; daily counts stay capped', () => {
    const wanted = emptyReadingState();
    const read = recordReading(wanted, 'go', '2026-11-07', '11111111-1111-4111-8111-111111111111');
    expect(preferenceFor(read, 'go').interest).toBe('seen');
    expect(recordReading(read, 'go', '2026-11-07', '22222222-2222-4222-8222-222222222222')).toBe(read);
    const undone = undoReading(read, read.events[0].id);
    expect(readingStats(undone, 'go', '2026-11-07')).toMatchObject({ count: 0, completedToday: null });
    expect(preferenceFor(undone, 'go').interest).toBe('want');
    const again = recordReading(undone, 'go', '2026-11-07', '22222222-2222-4222-8222-222222222222');
    expect(readingStats(again, 'go', '2026-11-07').count).toBe(1);
    expect(again.events).toHaveLength(2);
  });
  it('restores skip on undo and preserves a manual category change after reading', () => {
    const skipped = setPreference(emptyReadingState(), { postId: 'go', interest: 'skip' });
    const read = recordReading(skipped, 'go', '2026-11-07', '11111111-1111-4111-8111-111111111111');
    expect(preferenceFor(undoReading(read, read.events[0].id), 'go').interest).toBe('skip');
    const changed = setPreference(read, { postId: 'go', interest: 'want' });
    expect(preferenceFor(undoReading(changed, read.events[0].id), 'go').interest).toBe('want');
  });
  it('undoing older history retains the newer read and its category', () => {
    const first = recordReading(emptyReadingState(), 'go', '2026-11-06', '11111111-1111-4111-8111-111111111111');
    const second = recordReading(first, 'go', '2026-11-07', '22222222-2222-4222-8222-222222222222');
    const undone = undoReading(second, first.events[0].id);
    expect(preferenceFor(undone, 'go').interest).toBe('seen');
    expect(readingStats(undone, 'go', '2026-11-07')).toMatchObject({ count: 1, lastDay: '2026-11-07' });
    expect(undoReading(undone, first.events[0].id)).toBe(undone);
  });
  it('normalizes legacy schedules into three categories while preserving revision and all history', () => {
    const events = [
      { id: '11111111-1111-4111-8111-111111111111', postId: 'go', day: '2026-11-06', undone: false },
      { id: '22222222-2222-4222-8222-222222222222', postId: 'sql', day: '2026-11-06', undone: true },
      { id: '33333333-3333-4333-8333-333333333333', postId: 'skip', day: '2026-11-06', undone: false },
    ];
    const legacy = {
      version: 1,
      preferences: [
        { postId: 'go', interest: 'want', reviewInterval: 7, reviewFrom: '2026-11-01' },
        { postId: 'sql', interest: 'none', reviewInterval: 0, reviewFrom: null },
        { postId: 'skip', interest: 'skip', reviewInterval: 14, reviewFrom: '2026-11-01' },
      ],
      events,
    };
    const snapshot = parseReadingSnapshot({ state: legacy, revision: 12, updatedAt: null });
    expect(snapshot).toEqual({
      revision: 12,
      updatedAt: null,
      state: {
        version: 2,
        preferences: [
          { postId: 'go', interest: 'seen' },
          { postId: 'sql', interest: 'want' },
          { postId: 'skip', interest: 'skip' },
        ],
        events,
      },
    });
    expect(legacy.preferences[0].reviewInterval).toBe(7);
    const undone = undoReading(snapshot.state!, events[0].id);
    expect(preferenceFor(undone, 'go').interest).toBe('want');
    expect(readingStats(undone, 'go', '2026-11-07').count).toBe(0);
  });
  it('uses Beijing day and accepts only valid persisted records', () => {
    expect(readingDay(new Date('2026-11-06T16:00:00Z'))).toBe('2026-11-07');
    const state = recordReading(emptyReadingState(), 'go', '2026-11-07', '11111111-1111-4111-8111-111111111111');
    expect(parseReadingSnapshot({ state, revision: 1, updatedAt: null }).state).toBe(state);
    expect(() =>
      parseReadingSnapshot({
        state: {
          ...state,
          events: [...state.events, { ...state.events[0], id: '22222222-2222-4222-8222-222222222222' }],
        },
        revision: 2,
        updatedAt: null,
      }),
    ).toThrow();
    expect(() =>
      parseReadingSnapshot({
        state: { ...state, events: [{ ...state.events[0], day: '2026-02-30' }] },
        revision: 2,
        updatedAt: null,
      }),
    ).toThrow();
    expect(() =>
      parseReadingSnapshot({
        state: { ...state, preferences: [{ postId: 'go', interest: 'seen', reviewInterval: 7 }] },
        revision: 2,
        updatedAt: null,
      }),
    ).toThrow();
    expect(() =>
      parseReadingSnapshot({
        state: { ...state, events: [{ ...state.events[0], previousInterest: 'none' }] },
        revision: 2,
        updatedAt: null,
      }),
    ).toThrow();
  });
});
