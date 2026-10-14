import "server-only";

/**
 * A short memory for what pages show from Meta (campaigns, results, the budget meter, the asset scan), so
 * moving between pages does not wait on Meta every time. Per process, per business. Fresh for `ttl`; after
 * that, for up to ten more minutes, the last answer is shown at once while a new one is fetched behind it
 * (the page says how old it is). Never used for anything that decides: budget enforcement, executions and
 * Mikee's own tools read live.
 */
type Entry = { at: number; ttl: number; value: Promise<unknown>; settled: boolean; refreshing?: boolean };
const store = new Map<string, Entry>();
const MAX = 500;
const STALE_FOR = 10 * 60_000;

function fresh<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const value = fn();
  const entry: Entry = { at: Date.now(), ttl, value, settled: false };
  store.set(key, entry);
  value.then(
    () => (entry.settled = true),
    // A failure is not remembered: the next visit tries again.
    () => store.get(key) === entry && store.delete(key),
  );
  if (store.size > MAX) store.delete(store.keys().next().value!);
  return value;
}

export function remember<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < hit.ttl) return hit.value as Promise<T>;
  if (hit?.settled && age < hit.ttl + STALE_FOR) {
    // Show what we have now; bring the new answer in behind it (once).
    if (!hit.refreshing) {
      hit.refreshing = true;
      fn().then(
        (v) => store.set(key, { at: Date.now(), ttl: ttlMs, value: Promise.resolve(v), settled: true }),
        () => (hit.refreshing = false),
      );
    }
    return hit.value as Promise<T>;
  }
  return fresh(key, ttlMs, fn);
}

/** How old the remembered answer is, in ms (null when there is none). */
export function rememberedAge(key: string): number | null {
  const hit = store.get(key);
  return hit ? Date.now() - hit.at : null;
}

/** Something changed for this business (a card ran, assets were chosen): show fresh numbers next time. */
export function forgetBusiness(workspaceId: string) {
  for (const key of store.keys()) if (key.includes(workspaceId)) store.delete(key);
}
