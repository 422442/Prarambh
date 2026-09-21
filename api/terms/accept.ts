import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleTermsAccept } from "../../server/routes/terms";

export default adapter(async (request) => {
  const { env, db } = await makeContext();
  return handleTermsAccept(request, db, env);
});
