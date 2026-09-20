import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleAdminSettingsUpdate } from "../../server/routes/admin-settings";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleAdminSettingsUpdate(request, db, env);
});
