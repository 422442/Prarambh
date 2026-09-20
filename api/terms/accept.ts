import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleTermsAccept } from "../../server/routes/terms";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleTermsAccept(request, db, env);
});
