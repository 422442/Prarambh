import { adapter } from "../../vercel";
import { makeContext } from "../../context";
import { handleTermsAccept } from "../../routes/terms";

export default adapter(async (request) => {
  const { env, db } = await makeContext();
  return handleTermsAccept(request, db, env);
});
