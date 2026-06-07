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
});
