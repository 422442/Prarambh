import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleExamSnapshot } from "../../server/routes/exam-snapshot";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleExamSnapshot(request, db, env);
});
