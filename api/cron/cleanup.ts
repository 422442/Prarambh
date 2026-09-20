import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleCronCleanup } from "../../server/routes/cron";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleCronCleanup(request, db, env);
});
