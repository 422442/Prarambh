import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleAdminStats } from "../../server/routes/admin-stats";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleAdminStats(request, db, env);
});
