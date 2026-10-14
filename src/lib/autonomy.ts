/**
 * How much Mikee asks before moving on: the client picks one of three levels in the composer. Spending and
 * publishing always need her approval on a card, at every level, and the monthly budget stays a hard ceiling.
 */
export type Autonomy = "every_step" | "important" | "final";

export const DEFAULT_AUTONOMY: Autonomy = "important";

export const AUTONOMY: { id: Autonomy; label: string; short: string; description: string }[] = [
  { id: "every_step", label: "אישור בכל שלב", short: "בכל שלב", description: "מייקי עוצר ושואל לפני כל צעד" },
  { id: "important", label: "אישור במקומות חשובים", short: "במקומות חשובים", description: "מייקי מתקדם לבד ושואל על החלטות שחשובות לעסק" },
  { id: "final", label: "אישור סופי בלבד", short: "סופי בלבד", description: "מייקי מכין הכול ומביא לך אישור אחד בסוף" },
];

/** What Mikee is told, per level, at the start of every turn. */
export const AUTONOMY_RULES: Record<Autonomy, string> = {
  every_step:
    "The client chose: approval at every step. Before each piece of work (handing a task to a specialist, writing or changing a playbook, reading her accounts in depth), say in one short line what you are about to do and why, and wait for her OK (offer quick replies such as \"כן, תתקדם\"). Do one step per turn. Ask rather than assume.",
  important:
    "The client chose: approval at the important points. Go ahead with preparation on your own (reading data, briefing specialists, drafting). Stop and ask only on decisions that matter to the business and that you cannot infer: the offer, the budget, the audience, the tone when it is unclear. Cards for spending and publishing as always.",
  final:
    "The client chose: final approval only. Do not stop to ask questions: make reasonable choices yourself from what you know (the brief, the brain, past results), prepare everything, and bring one card for her approval at the end. Ask only if something essential is missing and cannot be inferred (for example, no budget at all). For a new campaign, her approval of the campaign card builds it and, if the check after building finds no problem, takes it live: tell her so plainly (one approval, then it goes live).",
};
