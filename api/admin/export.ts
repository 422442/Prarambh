import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleAdminExport } from "../../server/routes/admin-export";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleAdminExport(request, db, env);
});
