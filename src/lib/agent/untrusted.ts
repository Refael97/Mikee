/**
 * Text that did not come from the client or the platform (websites, social posts and comments, search
 * results, uploaded files, store data) is wrapped so the model always knows it is data to read, never
 * instructions to follow. Any look-alike tags inside it are neutralised so it cannot close the wrapper.
 */
export function untrusted(source: string, text: string): string {
  const clean = text.replace(/<\/?\s*(untrusted|client[_\s-]*skill)[^>]*>/gi, "").replace(/\[(\s*)(platform event|scheduled check-in|mikee reaching out)/gi, "($1$2");
  return `<untrusted source="${source}">\n${clean}\n</untrusted>`;
}

/**
 * A media address or an id: one token, no spaces or markup. These are passed on exactly as they came (a
 * wrapped URL is no longer a URL); they cannot carry sentences to follow.
 */
const URL_OR_ID = /^(https?:\/\/[^\s<>"'`]+|[A-Za-z0-9_:.\-]{1,200})$/;

/** Applies untrusted() to every text inside a tool result, keeping its structure, URLs and ids. */
export function wrapStrings(source: string, value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    if (URL_OR_ID.test(value)) return value;
    // Anything with a space is text someone wrote, however short ("ignore the budget" fits in a few words).
    return /\s/.test(value) || value.length > 40 ? untrusted(source, value) : value.replace(/<\/?\s*untrusted[^>]*>/gi, "");
  }
  if (depth > 6 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => wrapStrings(source, v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wrapStrings(source, v, depth + 1)]));
}
