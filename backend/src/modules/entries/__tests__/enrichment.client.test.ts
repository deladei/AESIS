import { enrichmentResponseSchema } from '../enrichment.client';

// Pure schema-contract tests — no network. These prove the "force JSON-schema
// output and validate it" requirement: anything off-contract is rejected so it
// can never become a malformed ai_assessment row.
describe('enrichment response validation', () => {
  const valid = {
    model_name: 'aesis-entry-relevance/v1',
    relevance: 0.667,
    summary: {
      headline: '3 activities logged; 2 clearly CS-relevant.',
      themes: ['software_engineering', 'testing_quality'],
      activity_relevance: [
        { description: 'Built an API', relevance: 1, on_topic: true, themes: ['software_engineering'] },
      ],
      concerns: [],
    },
  };

  it('accepts a well-formed response', () => {
    expect(() => enrichmentResponseSchema.parse(valid)).not.toThrow();
  });

  it('defaults missing summary arrays rather than failing', () => {
    const parsed = enrichmentResponseSchema.parse({
      model_name: 'm',
      relevance: 0.5,
      summary: { headline: 'ok' },
    });
    expect(parsed.summary.themes).toEqual([]);
    expect(parsed.summary.concerns).toEqual([]);
  });

  it('rejects relevance out of [0,1]', () => {
    expect(() => enrichmentResponseSchema.parse({ ...valid, relevance: 1.5 })).toThrow();
  });

  it('rejects a non-object / garbage response', () => {
    expect(() => enrichmentResponseSchema.parse('not json')).toThrow();
    expect(() => enrichmentResponseSchema.parse({ model_name: 'm' })).toThrow();
  });

  // ── v2 report fields (quality / plagiarism / feedback_draft) ──────────────
  const quality = {
    overall: 38.9,
    task_depth: 53.3,
    tech_vocab: 36.2,
    reflection: 35.3,
    temporal_consistency: 25,
    relevance: 100,
    flags: ['low_cs_relevance'],
    feedback: 'Add a reflective paragraph.',
  };
  const plagiarism = {
    checked: true,
    corpus_size: 12,
    max_similarity: 0.87,
    flagged: true,
    matches: [
      {
        entry_id: 'other-entry',
        similarity: 0.87,
        tfidf_similarity: 0.87,
        semantic_similarity: null,
        same_student: false,
      },
    ],
  };

  it('accepts a full v2 response with report fields', () => {
    const parsed = enrichmentResponseSchema.parse({
      ...valid,
      quality,
      plagiarism,
      feedback_draft: { text: 'Well done on the API work.', model: 'llama-3.1-8b-instant' },
    });
    expect(parsed.quality?.overall).toBeCloseTo(38.9);
    expect(parsed.plagiarism?.matches[0].semantic_similarity).toBeNull();
    expect(parsed.feedback_draft?.text).toContain('API');
  });

  it('still accepts a v1 response without report fields (older AI deploy)', () => {
    const parsed = enrichmentResponseSchema.parse(valid);
    expect(parsed.quality).toBeUndefined();
    expect(parsed.plagiarism).toBeUndefined();
    expect(parsed.feedback_draft).toBeUndefined();
  });

  it('accepts a null feedback_draft (Groq down — fail-open)', () => {
    const parsed = enrichmentResponseSchema.parse({ ...valid, quality, plagiarism, feedback_draft: null });
    expect(parsed.feedback_draft).toBeNull();
  });

  it('rejects quality scores outside [0,100] — never persisted', () => {
    expect(() =>
      enrichmentResponseSchema.parse({ ...valid, quality: { ...quality, overall: 101 } }),
    ).toThrow();
    expect(() =>
      enrichmentResponseSchema.parse({ ...valid, quality: { ...quality, reflection: -1 } }),
    ).toThrow();
  });

  it('rejects plagiarism similarity outside [0,1]', () => {
    expect(() =>
      enrichmentResponseSchema.parse({
        ...valid,
        plagiarism: { ...plagiarism, max_similarity: 1.2 },
      }),
    ).toThrow();
  });
});
