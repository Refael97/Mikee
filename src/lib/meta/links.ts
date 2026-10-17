/** Only addresses on Facebook and Instagram, so a link shown on the card can never point anywhere else. */
export function safePostLink(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  const full = url.startsWith("/") ? `https://www.facebook.com${url}` : url;
  try {
    const u = new URL(full);
    return u.protocol === "https:" && /(^|\.)(facebook|instagram)\.com$/.test(u.hostname) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
