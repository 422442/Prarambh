import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleRegister } from "../../server/routes/register";

export default adapter((request) => {
  const { env, db } = makeContext();
  return handleRegister(request, db, env);
});
