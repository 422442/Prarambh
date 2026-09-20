import { adapter } from "../../../../server/vercel";
import { makeContext } from "../../../../server/context";
import { handleAdminReset } from "../../../../server/routes/admin-reset";

export default adapter((request) => {
  const { env, db } = makeContext();
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // .../admin/participants/:id/reset
  const id = decodeURIComponent(parts[parts.length - 2] ?? "");
  return handleAdminReset(request, db, env, id);
});
