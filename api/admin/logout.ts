import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleAdminLogout } from "../../server/routes/admin-session";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleAdminLogout(request, db, env);
});
