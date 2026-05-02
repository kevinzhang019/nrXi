import { describe, it, expect } from "vitest";
import { sleepMs, isAbortError } from "./sleep";

describe("sleepMs", () => {
  it("resolves after the timeout elapses", async () => {
    const start = Date.now();
    await sleepMs(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it("resolves immediately when ms <= 0", async () => {
    const start = Date.now();
    await sleepMs(0);
    expect(Date.now() - start).toBeLessThan(10);
  });

  it("rejects with AbortError when signal is aborted before sleep", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(sleepMs(1000, ac.signal)).rejects.toSatisfy(isAbortError);
  });

  it("rejects with AbortError when signal aborts during sleep", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 5);
    await expect(sleepMs(1000, ac.signal)).rejects.toSatisfy(isAbortError);
  });

  it("does not reject when signal aborts after sleep resolves", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    await expect(sleepMs(10, ac.signal)).resolves.toBeUndefined();
  });
});
