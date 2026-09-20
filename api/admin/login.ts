import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleAdminLogin } from "../../server/routes/admin-login";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleAdminLogin(request, db, env);
});
