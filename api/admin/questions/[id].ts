import { adapter } from "../../../server/vercel";
import { makeContext } from "../../../server/context";
import { handleAdminQuestionUpdate, handleAdminQuestionDelete } from "../../../server/routes/admin-question-item";

export default adapter((request) => {
  const { env, db } = makeContext();
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const id = decodeURIComponent(parts[parts.length - 1] ?? "");
  if (request.method === "DELETE") return handleAdminQuestionDelete(request, db, env, id);
  return handleAdminQuestionUpdate(request, db, env, id);
});
