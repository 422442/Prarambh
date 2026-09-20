/**
 * Cookie sessions signed with jose (HS256). Two independent sessions:
 *  - participant (tq_participant): { sub: participantId, sid: sessionId }
 *  - admin (tq_admin): { sub: adminId, role: "admin" }
 */
import { SignJWT, jwtVerify } from "jose";
import { ApiError, buildSetCookie, parseCookies, type ServerEnv } from "./http";

export const PARTICIPANT_COOKIE = "tq_participant";
export const ADMIN_COOKIE = "tq_admin";

export const PARTICIPANT_MAX_AGE = 12 * 60 * 60; // 12h
export const ADMIN_MAX_AGE = 8 * 60 * 60; // 8h

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signToken(
  secret: string,
  payload: Record<string, unknown>,
  maxAgeSec: number,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSec)
    .sign(key(secret));
}

export async function verifyToken<T extends Record<string, unknown>>(
  secret: string,
  token: string | undefined,
): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret));
    return payload as unknown as T;
  } catch {
    return null;
  }
}

/** Secure unless plain http (lets `vercel dev` on http://localhost keep cookies). */
export function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]?.trim() === "https";
  return request.url.startsWith("https://");
}

export function participantSetCookie(request: Request, env: ServerEnv, token: string): string {
  return buildSetCookie(PARTICIPANT_COOKIE, token, {
    maxAgeSec: PARTICIPANT_MAX_AGE,
    secure: isSecureRequest(request),
  });
}

export function adminSetCookie(request: Request, env: ServerEnv, token: string): string {
  return buildSetCookie(ADMIN_COOKIE, token, {
    maxAgeSec: ADMIN_MAX_AGE,
    secure: isSecureRequest(request),
  });
}

export function clearCookie(name: string, secure: boolean): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export type ParticipantClaims = { sub: string; sid: string };

/** Verifies the participant JWT (signature + presence of claims). No DB access. */
export async function requireParticipantClaims(
  request: Request,
  env: ServerEnv,
): Promise<ParticipantClaims> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const claims = await verifyToken<ParticipantClaims>(
    env.sessionSecret,
    cookies[PARTICIPANT_COOKIE],
  );
  if (!claims?.sub || !claims?.sid) {
    throw new ApiError(401, "unauthorized", "Please log in to continue.");
  }
  return claims;
}

/**
 * Single-active-session rule: once an attempt exists, its stored session_id
 * must match the cookie's sid. A newer login rotates attempts.session_id via
 * /api/exam/start, which invalidates the older tab on its next request.
 */
export function ensureAttemptSession(
  attempt: { session_id: string } | null | undefined,
  claims: ParticipantClaims,
): void {
  if (attempt && attempt.session_id !== claims.sid) {
    throw new ApiError(
      401,
      "session_replaced",
      "This attempt was opened in another tab or device. That session is now active.",
    );
  }
}

export type AdminClaims = { sub: string; role: "admin" };

export async function requireAdmin(request: Request, env: ServerEnv): Promise<AdminClaims> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const claims = await verifyToken<AdminClaims>(env.sessionSecret, cookies[ADMIN_COOKIE]);
  if (!claims || claims.role !== "admin" || !claims.sub) {
    throw new ApiError(401, "unauthorized", "Admin authentication required.");
  }
  return claims;
}

/** Returns a Response header set that stores (or clears) the participant cookie. */
export function withParticipantCookie(request: Request, env: ServerEnv, token: string): Headers {
  const headers = new Headers();
  headers.append("set-cookie", participantSetCookie(request, env, token));
  return headers;
}
