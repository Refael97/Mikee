/** Mikee ends some answers with quick replies: a last line like [[כן, תכין | בוא נשנה משהו]]. */
const REPLIES = /\n?\[\[([^\]]+)\]\]\s*$/;

export function splitReplies(text: string): { text: string; replies: string[] } {
  const m = REPLIES.exec(text);
  if (!m) return { text, replies: [] };
  return {
    text: text.slice(0, m.index).trimEnd(),
    replies: m[1]
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}

/** The text without its quick replies, including a half-written [[ while the answer is still streaming. */
export const stripReplies = (text: string) => splitReplies(text.replace(/\[\[[^\]]*\]?$/, "")).text.trimEnd();
