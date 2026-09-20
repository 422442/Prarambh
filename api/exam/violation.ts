import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleExamViolation } from "../../server/routes/exam-violation";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleExamViolation(request, db, env);
});
