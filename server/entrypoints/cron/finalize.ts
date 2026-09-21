import { adapter } from "../../vercel";
import { makeContext } from "../../context";
import { handleCronFinalize } from "../../routes/cron";

export default adapter(async (request) => {
  const { env, db } = await makeContext();
  return handleCronFinalize(request, db, env);
});
