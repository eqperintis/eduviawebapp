import "server-only";
import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "edv_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days
const alg = "HS256";

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export type Session = {
  userId: string;
  email: string;
  // Fingerprint of the account's password at sign-in — see passwordVersion.
  passwordVersion?: string;
};

/**
 * A short, one-way fingerprint of an account's current password hash,
 * carried in every session token. Changing or resetting the password
 * changes it, which retires every session issued before — a session left
 * open on someone else's device, or taken by whoever the owner is locking
 * out, stops working the moment they change their password instead of
 * lasting out its 7 days. Derived from the salted bcrypt hash, so it can't
 * be turned back into anything useful.
 */
export function passwordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

export async function signSessionToken(session: Session) {
  return new SignJWT({ email: session.email, pv: session.passwordVersion })
    .setProtectedHeader({ alg })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return {
      userId: payload.sub,
      email: payload.email,
      passwordVersion: typeof payload.pv === "string" ? payload.pv : undefined,
    };
  } catch {
    return null;
  }
}

/** Signs the user in on this browser, stamped with their current password's fingerprint (read fresh, so call it after any password change). */
export async function createSession(session: Session) {
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
  const token = await signSessionToken({
    ...session,
    passwordVersion: user?.passwordHash ? passwordVersion(user.passwordHash) : undefined,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * The signed-in user, or null: the one check every access gate goes through.
 * A signed JWT is otherwise valid on its own for its full 7-day cookie
 * lifetime, so this also re-checks that the account still exists and that
 * the session was issued under its current password (see passwordVersion).
 */
export async function getAuthenticatedUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user?.passwordHash) return null;
  if (session.passwordVersion !== passwordVersion(user.passwordHash)) return null;

  return user;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session || !(await getAuthenticatedUser())) {
    throw new Error("Not authenticated");
  }
  return session;
}

/** For pages: the signed-in user, or a redirect to /login. */
export async function requireUser() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return user;
}
