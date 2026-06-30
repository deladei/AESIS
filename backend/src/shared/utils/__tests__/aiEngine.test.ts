import { buildAiUrl } from '../aiEngine';

describe('buildAiUrl (AI engine URL normalization)', () => {
  const PATH = '/ai/enrich/entry';

  it('builds the URL for a clean base', () => {
    expect(buildAiUrl('https://engine.onrender.com', PATH)).toBe('https://engine.onrender.com/ai/enrich/entry');
  });

  it('strips a trailing slash', () => {
    expect(buildAiUrl('https://engine.onrender.com/', PATH)).toBe('https://engine.onrender.com/ai/enrich/entry');
  });

  it('strips a trailing /ai so the path never doubles (the prod 404 bug)', () => {
    expect(buildAiUrl('https://engine.onrender.com/ai', PATH)).toBe('https://engine.onrender.com/ai/enrich/entry');
    expect(buildAiUrl('https://engine.onrender.com/ai/', PATH)).toBe('https://engine.onrender.com/ai/enrich/entry');
  });

  it('tolerates a missing leading slash on the path', () => {
    expect(buildAiUrl('https://engine.onrender.com', 'ai/chat')).toBe('https://engine.onrender.com/ai/chat');
  });
});
