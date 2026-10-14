import { describe, it, expect } from 'vitest';
import type { AgentPerfRow } from '@devdigest/shared';
import { costChange, fillDays, lowSample, mostActive, rate, shares, sortAgents, trend, windowBounds } from '../src/modules/performance/helpers.js';

const row = (over: Partial<AgentPerfRow>): AgentPerfRow => ({
  agent_id: 'a',
  name: 'A',
  runs: 1,
  failed: 0,
  cost_usd: null,
  avg_cost_usd: null,
  avg_duration_ms: null,
  accept_rate: null,
  decided: 0,
  accept_trend: null,
  low_sample: true,
  last_run_at: null,
  recent: [],
  ...over,
});

// SPEC-05 — the pure rules.
describe('performance helpers', () => {
  it('window: the last `days` UTC calendar days ending today, and the window before', () => {
    const w = windowBounds(7, new Date('2026-10-14T21:30:00+02:00')); // 19:30 UTC on the 14th
    expect(w.from.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(w.prevFrom.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('AC-7: runs per day has exactly `days` entries, 0 where nothing ran', () => {
    const from = new Date('2026-10-08T00:00:00Z');
    expect(fillDays([{ day: '2026-10-09', n: 3 }, { day: '2026-10-14', n: 1 }], from, 7)).toEqual([0, 3, 0, 0, 0, 0, 1]);
  });

  it('AC-4/AC-5: rate is unknown without decisions; the trend needs 5 decisions on both sides and moves past one point', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(3, 4)).toBe(0.75);
    expect(trend({ accepted: 8, decided: 10 }, { accepted: 6, decided: 10 })).toBe('up');
    expect(trend({ accepted: 6, decided: 10 }, { accepted: 8, decided: 10 })).toBe('down');
    expect(trend({ accepted: 801, decided: 1000 }, { accepted: 800, decided: 1000 })).toBe('flat'); // 0.1 pp
    expect(trend({ accepted: 81, decided: 100 }, { accepted: 80, decided: 100 })).toBe('flat'); // exactly 1 pp
    expect(trend({ accepted: 82, decided: 100 }, { accepted: 80, decided: 100 })).toBe('up');
    expect(trend({ accepted: 4, decided: 4 }, { accepted: 0, decided: 10 })).toBeNull();
    expect(lowSample({ accepted: 4, decided: 4 }, { accepted: 0, decided: 10 })).toBe(true);
    expect(lowSample({ accepted: 5, decided: 5 }, { accepted: 0, decided: 5 })).toBe(false);
  });

  it('AC-8: shares of the known total, largest first; null shares when the total is 0', () => {
    expect(shares([{ label: 'b', key: 'b', cost: 1 }, { label: 'a', key: 'a', cost: 3 }])).toEqual([
      { label: 'a', key: 'a', cost_usd: 3, share: 0.75 },
      { label: 'b', key: 'b', cost_usd: 1, share: 0.25 },
    ]);
    expect(shares([{ label: 'free', key: null, cost: 0 }])[0]!.share).toBeNull();
  });

  it('AC-12: accept rate first (unknown last), then runs, then name', () => {
    const sorted = sortAgents([
      row({ agent_id: '1', name: 'Zed', accept_rate: null, runs: 50 }),
      row({ agent_id: '2', name: 'Bee', accept_rate: 0.5, runs: 2 }),
      row({ agent_id: '3', name: 'Ann', accept_rate: 0.5, runs: 2 }),
      row({ agent_id: '4', name: 'Cat', accept_rate: 0.9, runs: 1 }),
      row({ agent_id: '5', name: 'Dan', accept_rate: 0.5, runs: 9 }),
    ]);
    expect(sorted.map((r) => r.name)).toEqual(['Cat', 'Dan', 'Ann', 'Bee', 'Zed']);
  });

  it('AC-6/AC-7: the most active agent is never the deleted-agent row; ties by name; cost change needs both sides', () => {
    expect(mostActive([row({ agent_id: null, name: null, runs: 99 }), row({ agent_id: 'b', name: 'Bob', runs: 5 }), row({ agent_id: 'a', name: 'Al', runs: 5, accept_rate: 0.4 })])).toEqual({
      agent_id: 'a',
      name: 'Al',
      runs: 5,
      accept_rate: 0.4,
    });
    expect(mostActive([row({ agent_id: null, name: null })])).toBeNull();
    expect(costChange(0.5, 0.2)).toBeCloseTo(0.3);
    expect(costChange(0.5, null)).toBeNull();
    expect(costChange(null, 0.2)).toBeNull();
  });
});
