import { stripHtml, sanitizeLogbookText } from '../sanitize';

describe('stripHtml', () => {
  it('strips basic tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('strips nested tags', () => {
    expect(stripHtml('<b><i>text</i></b>')).toBe('text');
  });

  it('strips script tags', () => {
    expect(stripHtml('<script>alert(1)</script>content')).toBe('content');
  });

  it('trims surrounding whitespace', () => {
    expect(stripHtml('  plain text  ')).toBe('plain text');
  });

  it('leaves plain text unchanged', () => {
    expect(stripHtml('just plain text')).toBe('just plain text');
  });

  it('removes self-closing tags', () => {
    expect(stripHtml('line1<br/>line2')).toBe('line1line2');
  });
});

describe('sanitizeLogbookText', () => {
  it('sanitizes all required fields', () => {
    const result = sanitizeLogbookText({
      tasksCompleted:   '<b>tasks</b>',
      technologiesUsed: '<em>tech</em>',
      challenges:       '<script>xss</script>challenge',
      reflection:       '<p>reflection</p>',
    });

    expect(result.tasksCompleted).toBe('tasks');
    expect(result.technologiesUsed).toBe('tech');
    expect(result.challenges).toBe('challenge');
    expect(result.reflection).toBe('reflection');
  });

  it('passes through undefined optional fields as-is', () => {
    const result = sanitizeLogbookText({
      tasksCompleted:   'tasks',
      technologiesUsed: 'tech',
    });

    expect(result.challenges).toBeUndefined();
    expect(result.reflection).toBeUndefined();
  });

  it('sanitizes optional fields when present', () => {
    const result = sanitizeLogbookText({
      tasksCompleted:   'tasks',
      technologiesUsed: 'tech',
      challenges:       '<div>challenge</div>',
      reflection:       undefined,
    });

    expect(result.challenges).toBe('challenge');
    expect(result.reflection).toBeUndefined();
  });
});
