import { adapter } from "../../../server/vercel";
import { makeContext } from "../../../server/context";
import { handleAdminQuestionsList, handleAdminQuestionCreate } from "../../../server/routes/admin-questions";

export default adapter((request) => {
  const { env, db } = makeContext();
  if (request.method === "POST") return handleAdminQuestionCreate(request, db, env);
  return handleAdminQuestionsList(request, db, env);
});
