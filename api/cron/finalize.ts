import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleCronFinalize } from "../../server/routes/cron";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleCronFinalize(request, db, env);
});
