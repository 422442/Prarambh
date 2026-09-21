import { adapter } from "../../vercel";
import { makeContext } from "../../context";
import { handleExamStart } from "../../routes/exam-start";
import { handleExamStatus } from "../../routes/exam-status";
import { handleExamAnswer, handleExamHeartbeat } from "../../routes/exam-answer";
import { handleExamSubmit } from "../../routes/exam-submit";
import { handleExamSnapshot } from "../../routes/exam-snapshot";
import { handleExamViolation } from "../../routes/exam-violation";

function getSubpath(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  // /api/exam/<subpath>
  return parts[2] ?? "";
}

export default adapter(async (request) => {
  const { env, db } = await makeContext();
  const sub = getSubpath(request.url);

  switch (sub) {
    case "start":
      return handleExamStart(request, db, env);
    case "status":
      return handleExamStatus(request, db, env);
    case "answer":
      return handleExamAnswer(request, db, env);
    case "submit":
      return handleExamSubmit(request, db, env);
    case "heartbeat":
      return handleExamHeartbeat(request, db, env);
    case "snapshot":
      return handleExamSnapshot(request, db, env);
    case "violation":
      return handleExamViolation(request, db, env);
    default:
      return Promise.resolve(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));
  }
});
