import { adapter } from "../../../server/vercel";
import { makeContext } from "../../../server/context";
import { handleAdminParticipants } from "../../../server/routes/admin-participants";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleAdminParticipants(request, db, env);
});
