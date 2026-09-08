import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedis } from '../config/redis';

// The Redis client is configured to queue commands across reconnects
// (maxRetriesPerRequest: null + offline queue) so it never throws — good for
// crash-safety, but it means a command issued while Redis is unreachable waits
// forever. Race every store command against a short timeout so a Redis outage
// surfaces as a store error (handled by passOnStoreError below) instead of
// hanging the request indefinitely.
const REDIS_CMD_TIMEOUT_MS = 1_500;

/** Exported for tests: the store factory is where the boot-time race lives. */
export function makeStore(prefix: string) {
  const store = new RedisStore({
    sendCommand: (...args: string[]) => {
      let timer: NodeJS.Timeout | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const command: Promise<any> = (getRedis() as any).call(...args);
      // Only one side of a race is observed, but both still settle. When the
      // timeout wins, this rejects afterwards with nobody listening.
      command.catch(() => { /* the race below reported it, or nobody cared */ });

      return Promise.race([
        command,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('redis-command-timeout')), REDIS_CMD_TIMEOUT_MS);
        }),
        // Without this the timer stays armed for the full 1.5s after every
        // command that answers quickly.
      ]).finally(() => clearTimeout(timer));
    },
    prefix,
  });

  // rate-limit-redis loads its two Lua scripts in its CONSTRUCTOR and keeps the
  // promises without ever awaiting them:
  //
  //     this.incrementScriptSha = this.loadIncrementScript();
  //     this.getScriptSha       = this.loadGetScript();
  //
  // These stores are module-level consts, so that runs at IMPORT time — before
  // bootstrap() connects anything. On a cold boot both commands race a
  // still-connecting client, lose to the timeout above, and reject with no
  // handler attached. That is the source of the two "Unhandled promise
  // rejection: redis-command-timeout" lines on every single deploy.
  //
  // They cannot be adopted from inside sendCommand: `loadIncrementScript` awaits
  // our promise and stores its OWN derived one, which a catch in sendCommand
  // never reaches. Adopting them here is the only place that can, and it changes
  // no behaviour — increment() and get() already catch this rejection
  // themselves and reload the script on the next request.
  const scripts = store as unknown as {
    incrementScriptSha?: Promise<string>;
    getScriptSha?:       Promise<string>;
  };
  scripts.incrementScriptSha?.catch(() => { /* reloaded on first use */ });
  scripts.getScriptSha?.catch(() => { /* reloaded on first use */ });

  return store;
}

// AI chat / inference: 30 req / 15 min / IP — Groq free tier is 14.4k req/day.
export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('aesis:rl:ai:'),
  // Fail open: if Redis is unreachable the store command rejects (see timeout
  // above) and the request is allowed through unthrottled rather than 500ing or
  // hanging. Rate limiting is best-effort; a cache outage must not take the
  // chatbot down. Logged by express-rate-limit when it happens.
  passOnStoreError: true,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many AI requests. Please wait a few minutes and try again.',
  },
});
