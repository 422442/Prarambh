import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleAdminResetAll } from "../../server/routes/admin-reset-all";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleAdminResetAll(request, db, env);
});
