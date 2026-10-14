import "server-only";

/**
 * A short memory for what pages show from Meta (campaigns, results, the budget meter, the asset scan), so
 * moving between pages does not wait on Meta every time. Per process, per business, a minute or so.
 * Never used for anything that decides: budget enforcement, executions and Mikee's own tools read live.
 */
type Entry = { at: number; ttl: number; value: Promise<unknown> };
const store = new Map<string, Entry>();
const MAX = 500;

export function remember<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = fn();
  store.set(key, { at: Date.now(), ttl: ttlMs, value });
  // A failure is not remembered: the next visit tries again.
  value.catch(() => store.get(key)?.value === value && store.delete(key));
  if (store.size > MAX) store.delete(store.keys().next().value!);
  return value;
}

/** Something changed for this business (a card ran, assets were chosen): show fresh numbers next time. */
export function forgetBusiness(workspaceId: string) {
  for (const key of store.keys()) if (key.includes(workspaceId)) store.delete(key);
}
