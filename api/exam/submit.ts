import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleExamSubmit } from "../../server/routes/exam-submit";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleExamSubmit(request, db, env);
});
