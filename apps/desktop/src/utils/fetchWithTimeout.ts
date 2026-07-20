function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// fetch() with a timeout that turns "host unreachable / hung" into a clear,
// user-presentable Error instead of an indefinite pending promise. Mirrors
// apps/web/src/platform/http.ts — kept app-side per the packages/ui
// consolidation recipe (network fetch stays behind callback props, not in
// packages/ui itself).
export async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError" && controller.signal.aborted) {
      throw new Error(`Timed out reaching ${hostOf(url)} — it may be offline or unreachable.`);
    }
    if (e instanceof TypeError) {
      throw new Error(`Could not reach ${hostOf(url)} — check the address and your connection.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
