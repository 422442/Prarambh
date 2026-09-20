import { adapter } from "../server/vercel";
import { makeContext } from "../server/context";

export default adapter(async () => {
  return new Response(JSON.stringify({ serverTime: Date.now() }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
