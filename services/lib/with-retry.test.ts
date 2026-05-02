import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./with-retry";

describe("withRetry", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const r = await withRetry(fn);
    expect(r).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient failure and eventually returns", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls < 3) return Promise.reject(new Error("flaky"));
      return Promise.resolve("eventually");
    });
    const r = await withRetry(fn, { tries: 3, delayMs: 1 });
    expect(r).toBe("eventually");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("never works"));
    await expect(withRetry(fn, { tries: 3, delayMs: 1 })).rejects.toThrow("never works");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects an aborted signal before the first call", async () => {
    const ac = new AbortController();
    ac.abort();
    const fn = vi.fn();
    await expect(withRetry(fn, { signal: ac.signal })).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it("aborts during the backoff sleep", async () => {
    const ac = new AbortController();
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        // Abort while the next backoff sleep is in flight.
        setTimeout(() => ac.abort(), 5);
        return Promise.reject(new Error("first-fail"));
      }
      return Promise.resolve("should-not-reach");
    });
    await expect(
      withRetry(fn, { tries: 5, delayMs: 1000, signal: ac.signal }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not swallow AbortError from inside fn", async () => {
    const fn = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(withRetry(fn, { tries: 5 })).rejects.toThrow();
    // AbortError should short-circuit — only one call.
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
