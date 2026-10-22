import "server-only";
import { db } from "@/lib/db";

/**
 * One Google account connected for the whole app (see GoogleIntegration in
 * schema.prisma, a single "default" row). Ported from SEKOOL. Used by the
 * Google Sheets automation step to pick a spreadsheet and write rows via the
 * real Sheets API, instead of a hand-written Apps Script web app.
 *
 * `drive.file` (not the broader `drive.readonly`) is deliberate: paired with
 * the Google Picker, it only grants access to whatever file the owner
 * actually selects through the picker, never the rest of their Drive.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function redirectUri(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/google/callback`;
}

/** What's still missing before Google can be connected, for the Account page. */
export function missingGoogleSettings(): string[] {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_PICKER_API_KEY"].filter((key) =>
    key === "GOOGLE_PICKER_API_KEY" ? !googlePickerApiKey() : !process.env[key],
  );
}

/** The browser key the Google Picker needs. Read at request time and passed
 * down as a prop, so changing it in hPanel needs a restart, not a rebuild. */
export function googlePickerApiKey(): string | null {
  return process.env.GOOGLE_PICKER_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY || null;
}

/**
 * The Cloud project number, which the Picker needs (setAppId) so a file
 * picked under the drive.file scope is actually shared with this app. It's
 * the digits before the first "-" of the OAuth client ID.
 */
export function googleProjectNumber(): string | null {
  const match = /^(\d+)-/.exec(process.env.GOOGLE_CLIENT_ID ?? "");
  return match ? match[1] : null;
}

/** `state` is a random value also kept in a cookie, checked on the way back
 * so nobody can link this account to theirs by sending a crafted callback. */
export function buildGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Google isn't configured on this server yet.");

  const params = new URLSearchParams({
    state,
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    access_type: "offline",
    // Forces Google to hand back a refresh_token even on a reconnect — it's
    // only issued on first-ever consent otherwise, which would silently
    // leave a reconnect with no way to get a fresh one.
    prompt: "consent",
    scope: SCOPES,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google isn't configured on this server yet.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
  });
  if (!response.ok) throw new Error("Google rejected that authorization code.");

  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  let connectedEmail: string | null = null;
  try {
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    if (userInfoRes.ok) {
      const userInfo = (await userInfoRes.json()) as { email?: string };
      connectedEmail = userInfo.email ?? null;
    }
  } catch {
    // Non-fatal — the connection still works without a display email.
  }

  await db.googleIntegration.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      connectedEmail,
      refreshToken: json.refresh_token ?? null,
      accessToken: json.access_token,
      accessTokenExpiresAt: new Date(Date.now() + json.expires_in * 1000),
    },
    update: {
      connectedEmail: connectedEmail ?? undefined,
      // Google only returns a refresh_token when there's something new to
      // consent to — prompt=consent above guarantees one on every connect,
      // but keep the old one rather than null it out just in case.
      refreshToken: json.refresh_token ?? undefined,
      accessToken: json.access_token,
      accessTokenExpiresAt: new Date(Date.now() + json.expires_in * 1000),
    },
  });
}

export async function disconnectGoogle(): Promise<void> {
  await db.googleIntegration.deleteMany({ where: { id: "default" } });
}

export async function getGoogleConnectionStatus(): Promise<{
  connected: boolean;
  email: string | null;
}> {
  const row = await db.googleIntegration.findUnique({ where: { id: "default" } });
  return { connected: Boolean(row?.refreshToken), email: row?.connectedEmail ?? null };
}

/**
 * A valid access token for calling Google APIs server-side, refreshing it
 * first if it's expired (or about to be, within the next minute). Null if
 * Google was never connected — every caller treats that as "this step can't
 * run yet" rather than throwing.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const row = await db.googleIntegration.findUnique({ where: { id: "default" } });
  if (!row?.refreshToken) return null;

  const stillValid =
    row.accessToken &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() > Date.now() + 60_000;
  if (stillValid) return row.accessToken;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) return null;

  const json = (await response.json()) as { access_token: string; expires_in: number };
  await db.googleIntegration.update({
    where: { id: "default" },
    data: {
      accessToken: json.access_token,
      accessTokenExpiresAt: new Date(Date.now() + json.expires_in * 1000),
    },
  });

  return json.access_token;
}

/** A short-lived access token for the client-side Picker widget — it never
 * sees the refresh token, only this. */
export async function getAccessTokenForPicker(): Promise<string | null> {
  return getValidAccessToken();
}
