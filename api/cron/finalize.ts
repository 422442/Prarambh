import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleCronFinalize } from "../../server/routes/cron";

export default adapter(async (request) => {
  const { env, db } = await makeContext();
  return handleCronFinalize(request, db, env);
});
