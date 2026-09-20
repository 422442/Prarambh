/**
 * Fisher–Yates shuffle using crypto randomness.
 * Used for per-participant question AND option ordering at exam start.
 */
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

function secureRandomInt(maxExclusive: number): number {
  // Rejection sampling for a uniform distribution.
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0]! >= limit);
  return buf[0]! % maxExclusive;
}

export const OPTION_KEYS = ["A", "B", "C", "D"] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

/** One entry of attempts.question_order (JSON). */
export type OrderedQuestion = { qid: string; options: OptionKey[] };

export function buildQuestionOrder(
  questions: Array<{ id: string }>,
): OrderedQuestion[] {
  return shuffle(questions.map((q) => ({ qid: q.id, options: shuffle([...OPTION_KEYS]) })));
}
