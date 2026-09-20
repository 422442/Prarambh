import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleAdminSession } from "../../server/routes/admin-session";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleAdminSession(request, db, env);
});
