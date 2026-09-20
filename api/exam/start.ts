import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleExamStart } from "../../server/routes/exam-start";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleExamStart(request, db, env);
});
