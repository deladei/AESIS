import {
  personName, organisationName, email, ghanaPhone, normaliseGhanaPhone,
  indexNumber, optionalIndexNumber, freeText, optionalFreeText, weekNumber, weekNumberCeiling,
  dayHours, weekHours, score, ASSESSMENT_INDUSTRY_MAXIMA,
} from '../fields';

const ok = <T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, v: unknown) =>
  schema.safeParse(v);

describe('personName', () => {
  const name = personName('First name');

  // The whole point of the Unicode pattern: these are real names and must pass.
  it.each([
    ['Kwame', 'plain'],
    ['Nana Ama', 'space'],
    ['Owusu-Ansah', 'hyphen'],
    ["N'Guessan", 'straight apostrophe'],
    ['N’Guessan', 'curly apostrophe'],
    ['Améyaw', 'accented'],
    ['Böröcz', 'umlaut + accent'],
    ['Ekow Jr.', 'suffix with period'],
    ['Ama Serwaa Nyarko', 'three parts'],
  ])('accepts %s (%s)', (value) => {
    expect(ok(name, value).success).toBe(true);
  });

  it.each([
    ['Kwame3', 'digits'],
    ['Kwame@home', 'symbol'],
    ['K', 'too short'],
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ["'Kwame", 'leading punctuation'],
    ['-Kwame', 'leading hyphen'],
    ['<script>x</script>', 'markup'],
  ])('rejects %s (%s)', (value) => {
    expect(ok(name, value).success).toBe(false);
  });

  it('trims before validating', () => {
    const r = name.safeParse('  Akosua  ');
    expect(r.success && r.data).toBe('Akosua');
  });

  it('rejects over 50 characters', () => {
    expect(ok(name, 'A'.repeat(51)).success).toBe(false);
  });
});

describe('organisationName', () => {
  it.each(['Hubtel', 'Hubtel 2 Ltd', 'Kofi & Sons', 'MTN Ghana (Accra)', 'A/S Danfoss'])(
    'accepts %s',
    (v) => expect(ok(organisationName(), v).success).toBe(true),
  );
  it('rejects markup', () => {
    expect(ok(organisationName(), '<b>Hubtel</b>').success).toBe(false);
  });
});

describe('email', () => {
  it('lowercases and trims', () => {
    const r = email().safeParse('  Kwame.Mensah@UG.EDU.GH ');
    expect(r.success && r.data).toBe('kwame.mensah@ug.edu.gh');
  });
  it.each(['not-an-email', 'a@', '@b.com', ''])('rejects %s', (v) => {
    expect(ok(email(), v).success).toBe(false);
  });
});

describe('ghanaPhone', () => {
  it.each([
    ['0244123456', '+233244123456'],
    ['+233244123456', '+233244123456'],
    ['233244123456', '+233244123456'],
    ['024 412 3456', '+233244123456'],
    ['024-412-3456', '+233244123456'],
    ['(024) 412 3456', '+233244123456'],
  ])('normalises %s to %s', (input, expected) => {
    const r = ghanaPhone().safeParse(input);
    expect(r.success && r.data).toBe(expected);
  });

  it.each([
    ['024412345', 'too short'],
    ['02441234567', 'too long'],
    ['+2340244123456', 'wrong country code'],
    ['abcdefghij', 'letters'],
    ['', 'empty'],
  ])('rejects %s (%s)', (value) => {
    expect(ok(ghanaPhone(), value).success).toBe(false);
  });

  it('normaliseGhanaPhone returns null rather than throwing', () => {
    expect(normaliseGhanaPhone('nonsense')).toBeNull();
  });
});

describe('indexNumber', () => {
  // Three capital letters then seven digits, ten characters exactly.
  it.each(['UEB0201421', 'CSC0000001', 'ZZZ9999999'])('accepts %s', (v) => {
    expect(ok(indexNumber, v).success).toBe(true);
  });

  it('accepts it typed in lower case and stores it upper-cased', () => {
    // It is printed on the card in capitals and read off it, so this is the
    // same student — and storing both spellings would be two accounts.
    const parsed = ok(indexNumber, '  ueb0201421  ');
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBe('UEB0201421');
  });

  it.each([
    ['ab',            'far too short'],
    ['UEB020142',     'six digits'],
    ['UEB02014211',   'eight digits'],
    ['UE0201421',     'only two letters'],
    ['UEBA201421',    'four letters'],
    ['UEB 0201421',   'an internal space'],
    ['UEB@0201421',   'a symbol'],
    ['CS/2026/0417',  'the old slash form'],
    ['AB-1234',       'the old hyphen form'],
    ['0201421UEB',    'the right characters in the wrong order'],
  ])('rejects %s (%s)', (v) => {
    expect(ok(indexNumber, v).success).toBe(false);
  });
});

describe('optionalIndexNumber', () => {
  it('treats a blank cell as absence, not as a bad value', () => {
    // A coordinator pasting a spreadsheet with an empty column should not be
    // told the file is invalid.
    const parsed = ok(optionalIndexNumber, '   ');
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBeNull();
  });

  it.each([undefined, null])('accepts %s', (v) => {
    expect(ok(optionalIndexNumber, v).success).toBe(true);
  });

  it('still enforces the format when a value is present', () => {
    expect(ok(optionalIndexNumber, 'CS/2026/0417').success).toBe(false);
    expect(ok(optionalIndexNumber, 'ueb0201421').success).toBe(true);
  });
});

describe('freeText', () => {
  it('rejects empty-after-trim', () => {
    expect(ok(freeText(100), '     ').success).toBe(false);
  });
  it('trims the stored value', () => {
    const r = freeText(100).safeParse('  did some work  ');
    expect(r.success && r.data).toBe('did some work');
  });
  it('enforces the max', () => {
    expect(ok(freeText(10), 'x'.repeat(11)).success).toBe(false);
  });
  it('optionalFreeText collapses blank to undefined', () => {
    const r = optionalFreeText(100).safeParse('   ');
    expect(r.success && r.data).toBeUndefined();
  });
});

describe('weekNumber', () => {
  it('is bounded by the cohort, not a literal', () => {
    // The bug this replaces: a 24-week cohort could not save week 7 because the
    // entries schema hardcoded max(6).
    expect(ok(weekNumber(24), 7).success).toBe(true);
    expect(ok(weekNumber(6), 7).success).toBe(false);
    expect(ok(weekNumber(24), 25).success).toBe(false);
  });
  it.each([0, -1, 1.5, Number.NaN])('rejects %p', (v) => {
    expect(ok(weekNumber(24), v).success).toBe(false);
  });
  it('names the cohort bound in the message', () => {
    const r = weekNumber(8).safeParse(9);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain('8');
  });
  it('ceiling stops absurd input before the cohort is known', () => {
    expect(ok(weekNumberCeiling(), 52).success).toBe(true);
    expect(ok(weekNumberCeiling(), 53).success).toBe(false);
  });
});

describe('numeric bounds', () => {
  it('dayHours is 0–24', () => {
    expect(ok(dayHours, 0).success).toBe(true);
    expect(ok(dayHours, 24).success).toBe(true);
    expect(ok(dayHours, 25).success).toBe(false);
    expect(ok(dayHours, -1).success).toBe(false);
  });
  it('weekHours is 0–168', () => {
    expect(ok(weekHours, 168).success).toBe(true);
    expect(ok(weekHours, 169).success).toBe(false);
  });
  it('score respects its max', () => {
    expect(ok(score(20), 20).success).toBe(true);
    expect(ok(score(20), 21).success).toBe(false);
  });
});

describe('assessment maxima mirror the DB CHECK constraints', () => {
  // If this table drifts from 20260718130000_assessment_industry, writes fail at
  // the database with a 500 instead of a field-level 422.
  it('matches the migration verbatim', () => {
    expect(ASSESSMENT_INDUSTRY_MAXIMA).toEqual({
      attendance: 20,
      understanding: 20,
      aptitude: 15,
      punctuality: 15,
      autonomy: 10,
      cooperation: 10,
      safety: 10,
    });
  });
  it('sums to 100', () => {
    const total = Object.values(ASSESSMENT_INDUSTRY_MAXIMA).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});
