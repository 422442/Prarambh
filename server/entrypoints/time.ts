import { adapter } from "../vercel";

/**
 * GET /api/time — dependency-free server clock.
 * Intentionally imports nothing else, so it also acts as a canary: if this
 * route answers, the function runtime/bundling/routing are healthy.
 */
export default adapter(async () => {
  return new Response(JSON.stringify({ serverTime: Date.now() }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
