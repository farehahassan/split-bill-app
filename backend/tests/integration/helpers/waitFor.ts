/**
 * Polls `predicate` until it returns truthy or `timeoutMs` elapses. This is the
 * bounded, deterministic way to observe naturally-asynchronous outcomes (Redis
 * key expiry, a claim becoming due) without hard-coding arbitrary `sleep()`
 * calls. Every meaningful expectation still runs against concrete state.
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 50;
  const description = options.description ?? "condition";

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (await predicate()) return;
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}.`);
}