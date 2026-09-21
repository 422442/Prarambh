import { adapter } from "../../vercel";
import { makeContext } from "../../context";
import { handleRegister } from "../../routes/register";

export default adapter(async (request) => {
  const { env, db } = await makeContext();
  return handleRegister(request, db, env);
});
