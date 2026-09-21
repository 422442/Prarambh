/**
 * Shared HTTP helpers for the /api serverless functions.
 * Everything is built on Web-standard Request/Response so handlers are
 * unit-testable without spawning a server (see tests/helpers.ts).
 */
import type { z } from "zod";

export type ServerEnv = {
  sessionSecret: string;
  cronSecret?: string;
  blobToken?: string;
  databaseUrl?: string;
  databaseAuthToken?: string;
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, init?: { status?: number; headers?: HeadersInit }): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status: init?.status ?? 200, headers });
}

export function errorResponse(err: unknown, context?: string): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  console.error(`[api] unhandled error${context ? ` in ${context}` : ""}:`, err);
  return json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500 });
}

/** Parses the Cookie header into a map. */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/** Builds a Set-Cookie header value. */
export function buildSetCookie(
  name: string,
  value: string,
  opts: { maxAgeSec: number; secure: boolean; path?: string },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? "/"}`,
    `Max-Age=${opts.maxAgeSec}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Validates a JSON request body against a zod schema. */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "bad_json", "Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path?.length ? ` at "${first.path.join(".")}"` : "";
    throw new ApiError(400, "invalid_body", `${first?.message ?? "Invalid request body."}${where}`);
  }
  return result.data;
}

export function searchParams(url: URL): URLSearchParams {
  return url.searchParams;
}

/** 'A' | 'B' | 'C' | 'D' helper. */
export const OPTION_KEYS = ["A", "B", "C", "D"] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];
