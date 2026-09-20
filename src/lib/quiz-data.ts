import questionsData from "../../prarambh_questions.json";

export type OptionKey = "A" | "B" | "C" | "D";

export type Question = {
  id: string;
  text: string;
  options: Record<OptionKey, string>;
  correct: OptionKey;
  isActive: boolean;
};

export const EXAM_CONFIG = {
  durationMinutes: questionsData.meta?.duration_minutes ?? 45,
  questionCount: questionsData.meta?.total_questions ?? 60,
  marksCorrect: questionsData.meta?.marks_correct ?? 2,
  marksWrong: questionsData.meta?.marks_wrong ?? -0.5,
  maxViolations: 3,
  termsVersion: "1.0",
};

export const ADMIN_EMAIL = "devnest.techclub@gmail.com";
export const ADMIN_PASSWORD = "CTOPrarambh2026";

function buildBank(): Question[] {
  const list = (questionsData as { questions: Array<{
    id: number;
    question: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct: string;
  }> }).questions;

  return list.map((q) => ({
    id: `q-${String(q.id).padStart(3, "0")}`,
    text: q.question,
    options: {
      A: q.option_a,
      B: q.option_b,
      C: q.option_c,
      D: q.option_d,
    },
    correct: q.correct.toUpperCase() as OptionKey,
    isActive: true,
  }));
}

export const QUESTION_BANK: Question[] = buildBank();

export const TERMS = [
  "I will complete this exam on my own without help from any person, website, AI tool, or device.",
  "The exam lasts 45 minutes and contains 60 questions. The timer starts when I click Start Exam and cannot be paused, even if I close the browser.",
  "Each correct answer earns 2 marks. Each wrong answer deducts 0.5 marks. Unanswered questions earn 0.",
  "The exam will be submitted automatically when the timer reaches 00:00.",
  "The exam must be taken in fullscreen. Switching tabs, switching windows, or exiting fullscreen counts as a violation.",
  "On the 3rd violation, my exam will be submitted automatically.",
  "I may attempt the exam only once with my email address.",
  "Results will be shared by the organisers; the score is not shown after submission.",
  "Cheating or attempting to bypass the monitoring may lead to disqualification.",
  "I confirm that the name and email I entered are correct and belong to me.",
];
