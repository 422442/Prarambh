import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleExamHeartbeat } from "../../server/routes/exam-answer";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleExamHeartbeat(request, db, env);
});
