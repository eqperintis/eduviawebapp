"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { disconnectGoogle, getAccessTokenForPicker } from "@/lib/google/oauth";
import { extractSpreadsheetId, getSheetHeaderRow, getSheetTabs } from "@/lib/google/sheets";

export async function disconnectGoogleAction(): Promise<void> {
  await requireUser();
  await disconnectGoogle();
  revalidatePath("/account");
}

/** A short-lived access token for the Picker in the browser, never the refresh token. */
export async function getGooglePickerTokenAction(): Promise<{ accessToken: string } | { error: string }> {
  await requireUser();
  const accessToken = await getAccessTokenForPicker();
  if (!accessToken) return { error: "Connect Google on the Account page first." };
  return { accessToken };
}

/** The tabs of a spreadsheet picked from Drive, for the step's tab dropdown. */
export async function loadGoogleSheetTabsAction(url: string): Promise<{ tabs: string[] } | { error: string }> {
  await requireUser();
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) return { error: "That isn't a Google Sheets file." };
  try {
    return { tabs: await getSheetTabs(spreadsheetId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't open that spreadsheet." };
  }
}

/** A tab's header row (row 1), so the step can list the sheet's own columns. */
export async function loadGoogleSheetColumnsAction(
  url: string,
  tab: string,
): Promise<{ headers: string[] } | { error: string }> {
  await requireUser();
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) return { error: "That isn't a Google Sheets file." };
  if (!tab.trim()) return { error: "Choose a tab first." };
  try {
    return { headers: await getSheetHeaderRow(spreadsheetId, tab.trim()) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't read that tab's columns." };
  }
}
