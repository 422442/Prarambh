import { adapter } from "../../../server/vercel";
import { makeContext } from "../../../server/context";
import { handleAdminQuestionsImport } from "../../../server/routes/admin-questions-import";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleAdminQuestionsImport(request, db, env);
});
