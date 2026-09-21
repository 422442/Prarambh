import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleRegister } from "../../server/routes/register";

export default adapter(async (request) => {
  const { env, db } = await makeContext();
  return handleRegister(request, db, env);
});
