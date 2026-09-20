import { adapter } from "../../../server/vercel";
import { makeContext } from "../../../server/context";
import { handleAdminParticipantDetail } from "../../../server/routes/admin-participant-detail";

export default adapter((request) => {
  const { env, db } = makeContext();
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const id = decodeURIComponent(parts[parts.length - 1] ?? "");
  return handleAdminParticipantDetail(request, db, env, id);
});
