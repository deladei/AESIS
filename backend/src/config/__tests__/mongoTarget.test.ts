/**
 * What `/health/mongo` says about the document store.
 *
 * `MONGO_URI` is `sync: false` on both this service and the AI engine
 * (render.yaml:33 and :144), so the two are typed into a dashboard separately
 * and drift. When they did, chat transcripts stopped being saved and nothing
 * anywhere said why.
 *
 * The rule: say what is wrong, never publish the credential.
 */
const mockEnv = { MONGO_URI: '' };
jest.mock('../env', () => ({ env: mockEnv }));
jest.mock('../logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { mongoTarget } from '../mongo';

const check = (uri: string) => {
  mockEnv.MONGO_URI = uri;
  return mongoTarget();
};

describe('mongoTarget', () => {
  it('reports the host and database for a good URI', () => {
    const t = check('mongodb+srv://aesis:s3cret@cluster0.abcd.mongodb.net/aesis?retryWrites=true');
    expect(t).toMatchObject({
      configured: true, host: 'mongodb.net', database: 'aesis', hasPassword: true,
    });
    expect(t.problem).toBeUndefined();
  });

  it('never publishes the credential', () => {
    const t = check('mongodb+srv://aesis:SuperSecret123@cluster0.abcd.mongodb.net/aesis');
    const dumped = JSON.stringify(t);
    expect(dumped).not.toContain('SuperSecret123');
    expect(dumped).not.toContain('aesis:');
  });

  it('names a URI that specifies no database', () => {
    // Without one every read fails before the credential is even tested, which
    // reads as an auth problem and is not.
    const t = check('mongodb+srv://aesis:s3cret@cluster0.abcd.mongodb.net/?retryWrites=true');
    expect(t.database).toBe('(none)');
    expect(t.problem).toMatch(/names no database/);
  });

  it('names a pasted newline', () => {
    // Mongo reports this as an auth failure, sending everyone to the password.
    const t = check('mongodb+srv://aesis:s3cret@cluster0.abcd.mongodb.net/aesis\n');
    expect(t.problem).toMatch(/whitespace/);
  });

  it('names a missing password', () => {
    const t = check('mongodb+srv://aesis@cluster0.abcd.mongodb.net/aesis');
    expect(t.hasPassword).toBe(false);
    expect(t.problem).toMatch(/no password/);
  });

  it('reports an empty setting as unconfigured', () => {
    const t = check('');
    expect(t.configured).toBe(false);
    expect(t.problem).toMatch(/empty/);
  });

  it('survives something that is not a URI at all', () => {
    // A diagnostic that throws is worse than the failure it describes.
    expect(() => check('not-a-uri')).not.toThrow();
    expect(check('not-a-uri').problem).toBeDefined();
  });

  it('reports not connected when nothing has connected', () => {
    // The endpoint answers 503 on this, so a scheduled ping fails loudly
    // rather than passing while transcripts quietly go nowhere.
    expect(check('mongodb+srv://a:b@c.mongodb.net/db').connected).toBe(false);
  });
});
