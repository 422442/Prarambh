/**
 * Vercel Serverless Function adapter (Node runtime).
 *
 * Each file in /api exports a default handler receiving Vercel's Node
 * req/res. This adapter converts to a Web-standard Request, runs the pure
 * core handler, and maps the Response back — so all business logic lives in
 * testable functions (server/routes/*.ts).
 *
 * Structural types only — avoids a hard dependency on @vercel/node types.
 */

export interface VercelLikeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  /** Raw TCP connection info, present on Vercel's Node runtime. */
  socket?: { remoteAddress?: string };
}

export interface VercelLikeResponse {
  statusCode(value: number): unknown;
  setHeader(name: string, value: string | string[]): unknown;
  getHeader(name: string): string | string[] | number | undefined;
  end(payload?: unknown): unknown;
}

export function buildRequestUrl(req: VercelLikeRequest): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0]?.trim() || "https";
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
  const pathAndQuery = req.url && req.url.startsWith("/") ? req.url : "/";
  return `${proto}://${host}${pathAndQuery}`;
}

export async function toWebRequest(req: VercelLikeRequest): Promise<Request> {
  const url = buildRequestUrl(req);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(name, v);
    } else {
      headers.set(name, value);
    }
  }
  const method = (req.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  let body: BodyInit | undefined;
  if (hasBody) {
    if (req.body === undefined || req.body === null) {
      body = undefined;
    } else if (typeof req.body === "string") {
      body = req.body;
    } else {
      // Vercel pre-parses JSON bodies into objects.
      body = JSON.stringify(req.body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }
  return new Request(url, { method, headers, body });
}

export async function sendWebResponse(web: Response, res: VercelLikeResponse): Promise<void> {
  res.statusCode(web.status);
  web.headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") return; // handled below (multiple values)
    res.setHeader(name, value);
  });
  const cookies = web.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);
  const buffer = await web.arrayBuffer();
  if (buffer.byteLength > 0) {
    res.end(Buffer.from(buffer));
  } else {
    res.end();
  }
}

export function clientIp(req: VercelLikeRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || "unknown";
  if (Array.isArray(forwarded) && forwarded[0]) return String(forwarded[0]).split(",")[0]?.trim() || "unknown";
  return req.socket?.remoteAddress ?? "unknown";
}

export function userAgent(req: VercelLikeRequest): string {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua : "";
}

/**
 * Wraps a pure core handler with the adapter plumbing.
 * Usage in /api/foo.ts:  export default adapter(handleFoo);
 */
export function adapter(
  core: (request: Request) => Promise<Response>,
): (req: VercelLikeRequest, res: VercelLikeResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const request = await toWebRequest(req);
      const response = await core(request);
      await sendWebResponse(response, res);
    } catch (err) {
      console.error("[api] adapter error:", err);
      try {
        res.statusCode(500);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: { code: "internal", message: "Something went wrong." } }));
      } catch {
        /* response already sent */
      }
    }
  };
}
