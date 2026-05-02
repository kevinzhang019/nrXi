import { sleepMs, isAbortError } from "./sleep";
import { log } from "../../lib/log";

export type RetryOpts = {
  tries?: number;
  delayMs?: number;
  signal?: AbortSignal;
  label?: string;
};

// Exponential-backoff retry. Replaces WDK's automatic step retry behaviour for
// the Railway port. Aborts immediately if `signal` fires (don't retry through
// shutdown). The label is only used for logging — it shows up in the failure
// trace so you can tell which call site is flaking.
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const tries = opts.tries ?? 3;
  const delayMs = opts.delayMs ?? 500;
  const signal = opts.signal;
  const label = opts.label ?? "withRetry";

  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn();
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastErr = err;
      if (attempt < tries) {
        const wait = delayMs * Math.pow(2, attempt - 1);
        log.warn("retry", `${label}:retry`, { attempt, tries, waitMs: wait, err: String(err) });
        await sleepMs(wait, signal);
      }
    }
  }
  log.error("retry", `${label}:exhausted`, { tries, err: String(lastErr) });
  throw lastErr;
}
