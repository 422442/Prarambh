import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleExamStatus } from "../../server/routes/exam-status";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleExamStatus(request, db, env);
});
