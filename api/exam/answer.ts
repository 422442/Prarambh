import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleExamAnswer } from "../../server/routes/exam-answer";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleExamAnswer(request, db, env);
});
