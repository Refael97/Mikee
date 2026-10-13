/** Titles are shown as plain text: emoji and pictographs are removed (the interface has its own icons). */
export const plainTitle = (s: string) =>
  s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
