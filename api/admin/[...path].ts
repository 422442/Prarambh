import { adapter } from "../../server/vercel";
import { makeContext } from "../../server/context";
import { handleAdminLogin } from "../../server/routes/admin-login";
import { handleAdminSession, handleAdminLogout } from "../../server/routes/admin-session";
import { handleAdminStats } from "../../server/routes/admin-stats";
import { handleAdminExport } from "../../server/routes/admin-export";
import { handleAdminSettingsUpdate } from "../../server/routes/admin-settings";
import { handleAdminResetAll } from "../../server/routes/admin-reset-all";
import { handleAdminParticipants } from "../../server/routes/admin-participants";
import { handleAdminParticipantDetail } from "../../server/routes/admin-participant-detail";
import { handleAdminReset } from "../../server/routes/admin-reset";
import { handleAdminQuestionsList, handleAdminQuestionCreate } from "../../server/routes/admin-questions";
import { handleAdminQuestionsImport } from "../../server/routes/admin-questions-import";
import { handleAdminQuestionUpdate, handleAdminQuestionDelete } from "../../server/routes/admin-question-item";

function parsePath(url: string): string[] {
  // /api/admin/participants/abc123/reset → ["participants", "abc123", "reset"]
  return new URL(url).pathname.split("/").filter(Boolean).slice(2);
}

export default adapter((request) => {
  const { env, db } = makeContext();
  const parts = parsePath(request.url);
  const sub = parts[0] ?? "";

  switch (sub) {
    case "login":
      return handleAdminLogin(request, db, env);
    case "logout":
      return handleAdminLogout(request, db, env);
    case "session":
      return handleAdminSession(request, db, env);
    case "stats":
      return handleAdminStats(request, db, env);
    case "export":
      return handleAdminExport(request, db, env);
    case "settings":
      return handleAdminSettingsUpdate(request, db, env);
    case "reset-all":
      return handleAdminResetAll(request, db, env);

    case "participants": {
      const id = parts[1] ? decodeURIComponent(parts[1]) : null;
      if (!id) return handleAdminParticipants(request, db, env);
      if (parts[2] === "reset") return handleAdminReset(request, db, env, id);
      return handleAdminParticipantDetail(request, db, env, id);
    }

    case "questions": {
      const id = parts[1] ? decodeURIComponent(parts[1]) : null;
      if (parts[1] === "import") return handleAdminQuestionsImport(request, db, env);
      if (!id) {
        if (request.method === "POST") return handleAdminQuestionCreate(request, db, env);
        return handleAdminQuestionsList(request, db, env);
      }
      if (request.method === "DELETE") return handleAdminQuestionDelete(request, db, env, id);
      return handleAdminQuestionUpdate(request, db, env, id);
    }

    default:
      return Promise.resolve(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));
  }
});
