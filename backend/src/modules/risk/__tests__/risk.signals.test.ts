import { scoreRisk, RISK_HIGH_THRESHOLD, RISK_MEDIUM_THRESHOLD, type RiskInput } from '../risk.signals';

const base: RiskInput = {
  weeksElapsed: 3,
  weeksSubmitted: 3,
  returnedCount: 0,
  lateDays: 0,
  submittedDays: 15,
  daysSinceLastActivity: 1,
};

describe('scoreRisk', () => {
  it('returns null before a full week has elapsed (no manufactured tiers)', () => {
    expect(scoreRisk({ ...base, weeksElapsed: 0 })).toBeNull();
    expect(scoreRisk({ ...base, weeksElapsed: 0.9 })).toBeNull();
  });

  it('scores an on-track student low with no named factors', () => {
    const r = scoreRisk({ ...base, daysSinceLastActivity: 0 });
    expect(r).not.toBeNull();
    expect(r!.tier).toBe('low');
    expect(r!.score).toBeLessThan(RISK_MEDIUM_THRESHOLD);
    expect(r!.factors).toHaveLength(0);
  });

  it('flags a fully silent student high', () => {
    const r = scoreRisk({
      weeksElapsed: 3,
      weeksSubmitted: 0,
      returnedCount: 0,
      lateDays: 0,
      submittedDays: 0,
      daysSinceLastActivity: null, // never submitted anything
    });
    expect(r!.tier).toBe('high');
    expect(r!.score).toBeGreaterThanOrEqual(RISK_HIGH_THRESHOLD);
    // Missing weeks + inactivity both saturate → 0.40 + 0.30
    expect(r!.score).toBeCloseTo(0.7, 3);
    expect(r!.factors[0].key).toBe('missing_weeks');
    expect(r!.factors[0].label).toBe('3 of 3 due weeks not submitted');
  });

  it('scores partial submission proportionally', () => {
    const r = scoreRisk({ ...base, weeksSubmitted: 2, daysSinceLastActivity: 0 });
    // 1/3 missing * 0.40 ≈ 0.133
    expect(r!.score).toBeCloseTo(0.133, 3);
    expect(r!.tier).toBe('low');
    expect(r!.factors.map((f) => f.key)).toContain('missing_weeks');
  });

  it('inactivity saturates at two weeks', () => {
    const at14 = scoreRisk({ ...base, daysSinceLastActivity: 14 })!;
    const at60 = scoreRisk({ ...base, daysSinceLastActivity: 60 })!;
    expect(at14.score).toBeCloseTo(0.3, 3);
    expect(at60.score).toBeCloseTo(0.3, 3);
    expect(at14.tier).toBe('medium');
  });

  it('late day logging contributes by ratio', () => {
    const r = scoreRisk({ ...base, lateDays: 15, submittedDays: 15, daysSinceLastActivity: 0 })!;
    expect(r.score).toBeCloseTo(0.15, 3);
    expect(r.factors[0].key).toBe('late_logging');
  });

  it('no submitted days means late logging cannot contribute', () => {
    const r = scoreRisk({
      ...base,
      weeksSubmitted: 3, // weeks submitted directly, no day logs
      lateDays: 0,
      submittedDays: 0,
      daysSinceLastActivity: 2,
    })!;
    expect(r.factors.map((f) => f.key)).not.toContain('late_logging');
  });

  it('returned weeks saturate at two', () => {
    const one = scoreRisk({ ...base, returnedCount: 1, daysSinceLastActivity: 0 })!;
    const five = scoreRisk({ ...base, returnedCount: 5, daysSinceLastActivity: 0 })!;
    expect(one.score).toBeCloseTo(0.075, 3);
    expect(five.score).toBeCloseTo(0.15, 3);
  });

  it('worst case saturates every signal and stays within 0..1', () => {
    const r = scoreRisk({
      weeksElapsed: 6,
      weeksSubmitted: 0,
      returnedCount: 6,
      lateDays: 10,
      submittedDays: 10,
      daysSinceLastActivity: 40,
    })!;
    expect(r.score).toBeCloseTo(1.0, 3);
    expect(r.tier).toBe('high');
    expect(r.factors).toHaveLength(4);
  });

  it('caps due weeks at the 6-week programme even for stale placements', () => {
    const r = scoreRisk({
      weeksElapsed: 30,
      weeksSubmitted: 6,
      returnedCount: 0,
      lateDays: 0,
      submittedDays: 30,
      daysSinceLastActivity: 0,
    })!;
    // All 6 programme weeks submitted → nothing missing despite 30 raw weeks.
    expect(r.factors.map((f) => f.key)).not.toContain('missing_weeks');
    expect(r.tier).toBe('low');
  });

  it('never counts extra submissions as negative risk', () => {
    const r = scoreRisk({ ...base, weeksSubmitted: 10, daysSinceLastActivity: 0 })!;
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
