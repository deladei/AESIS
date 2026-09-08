import { signalsFor, countWords, type SignalWeek } from '../progressSignals';

/**
 * These signals exist to say "look here", and the cost of a false one is a
 * supervisor's afternoon and a student's standing. So most of what is tested
 * here is the cases that must produce NOTHING.
 */

const week = (n: number, over: Partial<SignalWeek> = {}): SignalWeek => ({
  weekNumber:  n,
  submittedAt: new Date(`2026-02-0${n}T10:00:00Z`),
  periodEnd:   new Date(`2026-02-0${n}T23:59:00Z`),
  quality:     null,
  plagiarism:  null,
  competencyTags: ['software_engineering'],
  reflectionWords: 50,
  ...over,
});

const withQuality = (n: number, overall: number) => week(n, { quality: { overall } });
const kinds = (ws: SignalWeek[], cohort: number | null = 50) =>
  signalsFor(ws, cohort).map((s) => s.kind);

describe('quality decline', () => {
  it('reports three consecutive falls with the weeks and the drop', () => {
    const s = signalsFor([withQuality(1, 80), withQuality(2, 70), withQuality(3, 58)], null);
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe('quality_decline');
    // The evidence has to let a supervisor check the claim without re-reading
    // three weeks themselves.
    expect(s[0].evidence).toContain('week 1 80');
    expect(s[0].evidence).toContain('week 3 58');
    expect(s[0].evidence).toContain('down 22');
  });

  it('says nothing about two falls — a quiet week after a busy one is ordinary', () => {
    expect(kinds([withQuality(1, 80), withQuality(2, 60)], null)).toEqual([]);
  });

  it('says nothing about a drift too small to mention', () => {
    // 79 -> 78 -> 77 is three falls and still nothing worth a conversation.
    expect(kinds([withQuality(1, 79), withQuality(2, 78), withQuality(3, 77)], null)).toEqual([]);
  });

  it('says nothing when a week recovers', () => {
    expect(kinds([withQuality(1, 80), withQuality(2, 60), withQuality(3, 70)], null)).toEqual([]);
  });

  it('ignores unassessed weeks rather than reading them as zero', () => {
    // A week the engine never scored is missing data. Treating it as 0 would
    // manufacture a decline out of a Groq outage.
    expect(kinds([withQuality(1, 80), week(2), withQuality(3, 78)], null)).toEqual([]);
  });

  it('needs three assessed weeks before it says anything at all', () => {
    expect(kinds([withQuality(1, 90), withQuality(2, 40)], null)).toEqual([]);
  });
});

describe('repetition', () => {
  const sim = (n: number, s: number) =>
    week(n, { plagiarism: { checked: true, max_similarity: s } });

  it('reports a week that closely resembles an earlier one', () => {
    const s = signalsFor([sim(1, 0.2), sim(2, 0.9)], null);
    expect(s.map((x) => x.kind)).toContain('repetition');
    expect(s[0].evidence).toContain('90%');
    // Phrasing matters: a repetitive placement produces repetitive entries.
    expect(s[0].evidence).toContain('similarity is not a verdict');
  });

  it('says nothing below the threshold', () => {
    expect(kinds([sim(1, 0.5), sim(2, 0.7)], null)).toEqual([]);
  });

  it('ignores a report that was never actually checked', () => {
    // `checked: false` is the fail-open marker — no corpus, no comparison. It
    // is not evidence of originality.
    expect(kinds([week(1, { plagiarism: { checked: false, max_similarity: 0.99 } })], null)).toEqual([]);
  });

  it('ignores an unreadable similarity rather than treating it as zero', () => {
    expect(kinds([week(1, { plagiarism: { checked: true, max_similarity: 'very high' } })], null)).toEqual([]);
  });

  it('escalates when more than one week repeats', () => {
    const s = signalsFor([sim(1, 0.85), sim(2, 0.9)], null);
    expect(s.find((x) => x.kind === 'repetition')?.severity).toBe('high');
  });
});

describe('narrowing exposure', () => {
  const tags = (n: number, t: string[]) => week(n, { competencyTags: t });

  it('reports work that has stopped broadening', () => {
    const s = signalsFor([
      tags(1, ['a', 'b']), tags(2, ['c', 'd']), tags(3, ['e', 'f']),
      tags(4, ['a']), tags(5, ['a']), tags(6, ['a']),
    ], null);
    const found = s.find((x) => x.kind === 'narrowing_exposure');
    expect(found?.severity).toBe('high');   // down to a single area
    expect(found?.evidence).toContain('6 competency areas');
  });

  it('says nothing when the range held up', () => {
    expect(kinds([
      tags(1, ['a', 'b']), tags(2, ['c']), tags(3, ['d']),
      tags(4, ['a', 'b']), tags(5, ['c']), tags(6, ['d']),
    ], null)).toEqual([]);
  });

  it('says nothing about a small drop — 6 to 5 is not a story', () => {
    expect(kinds([
      tags(1, ['a', 'b', 'c']), tags(2, ['d', 'e']), tags(3, ['f']),
      tags(4, ['a', 'b', 'c']), tags(5, ['d', 'e']), tags(6, []),
    ], null)).toEqual([]);
  });

  it('needs four tagged weeks — with three you compare a week to itself', () => {
    expect(kinds([tags(1, ['a', 'b', 'c', 'd']), tags(2, ['a']), tags(3, ['a'])], null)).toEqual([]);
  });

  it('treats the same tag in different case as one area', () => {
    expect(kinds([
      tags(1, ['Testing']), tags(2, ['testing']), tags(3, ['TESTING']),
      tags(4, ['testing']), tags(5, ['testing']), tags(6, ['testing']),
    ], null)).toEqual([]);
  });
});

describe('deadline-only submission', () => {
  const atDeadline = (n: number) => week(n, {
    submittedAt: new Date(`2026-02-0${n}T21:00:00Z`),
    periodEnd:   new Date(`2026-02-0${n}T23:59:00Z`),
  });
  const early = (n: number) => week(n, {
    submittedAt: new Date(`2026-02-0${n}T09:00:00Z`),
    periodEnd:   new Date(`2026-02-0${n}T23:59:00Z`),
  });

  it('reports a student who only ever writes up at the cut-off', () => {
    const s = signalsFor([atDeadline(1), atDeadline(2), atDeadline(3)], null);
    expect(s.map((x) => x.kind)).toContain('deadline_only');
    // Never phrased as lateness — these weeks were all submitted on time.
    expect(s.find((x) => x.kind === 'deadline_only')?.severity).toBe('watch');
  });

  it('says nothing when even one week was written up early', () => {
    expect(kinds([atDeadline(1), early(2), atDeadline(3)], null)).toEqual([]);
  });

  it('needs three timed weeks', () => {
    expect(kinds([atDeadline(1), atDeadline(2)], null)).toEqual([]);
  });
});

describe('thin reflection', () => {
  const words = (n: number, w: number) => week(n, { reflectionWords: w });

  it('compares against the cohort, not a fixed number', () => {
    const s = signalsFor([words(1, 5), words(2, 6), words(3, 4)], 60);
    expect(s.map((x) => x.kind)).toContain('thin_reflection');
    expect(s.find((x) => x.kind === 'thin_reflection')?.evidence).toContain('cohort average of 60');
  });

  it('says nothing when the cohort writes just as little', () => {
    // The whole year group writing briefly is a prompt problem, not a student
    // problem, and flagging all of them would be noise.
    expect(kinds([words(1, 5), words(2, 6), words(3, 4)], 8)).toEqual([]);
  });

  it('says nothing when there is no cohort average to compare against', () => {
    expect(kinds([words(1, 0), words(2, 0), words(3, 0)], null)).toEqual([]);
  });

  it('treats an empty reflection as the serious case', () => {
    const s = signalsFor([words(1, 0), words(2, 0), words(3, 0)], 50);
    expect(s.find((x) => x.kind === 'thin_reflection')?.severity).toBe('high');
  });
});

describe('the whole set', () => {
  it('says nothing at all about a student with too little history', () => {
    // Nothing is inferred from silence: too few weeks means no signal, not a
    // good one and not a bad one.
    expect(kinds([week(1)], 50)).toEqual([]);
  });

  it('orders the serious ones first, deterministically', () => {
    const weeks = [
      week(1, { quality: { overall: 90 }, competencyTags: ['a', 'b'] }),
      week(2, { quality: { overall: 70 }, competencyTags: ['c', 'd'] }),
      week(3, { quality: { overall: 50 }, competencyTags: ['e', 'f'] }),
      week(4, { quality: { overall: 40 }, competencyTags: ['a'], reflectionWords: 0 }),
      week(5, { competencyTags: ['a'], reflectionWords: 0 }),
      week(6, { competencyTags: ['a'], reflectionWords: 0 }),
    ];
    const a = signalsFor(weeks, 50).map((s) => `${s.severity}:${s.kind}`);
    const b = signalsFor(weeks, 50).map((s) => `${s.severity}:${s.kind}`);

    expect(a).toEqual(b);
    expect(a[0].startsWith('high:')).toBe(true);
  });

  it('gives every signal evidence a supervisor can check', () => {
    const s = signalsFor([withQuality(1, 85), withQuality(2, 70), withQuality(3, 55)], 50);
    expect(s.length).toBeGreaterThan(0);
    for (const sig of s) {
      expect(sig.evidence.trim().length).toBeGreaterThan(0);
      expect(sig.headline.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('countWords', () => {
  it('counts across both reflection halves the same way for everyone', () => {
    expect(countWords('two words', 'and three more')).toBe(5);
  });
  it('treats null, undefined and whitespace as nothing written', () => {
    expect(countWords(null, undefined, '   ')).toBe(0);
  });
});
